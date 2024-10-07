import * as core from '@actions/core'
import { RepositoryInfo, RepositoryFile, SourceProvider } from '../types'

async function run(repository: string, ref: string, files: string[]): Promise<RepositoryInfo> {
  // validate Bitbucket inputs
  const username = process.env.PEW_BITBUCKET_USERNAME
  if (!username) {
    throw new Error('Bitbucket repositories must supply `env.PEW_BITBUCKET_USERNAME')
  }

  const password = process.env.PEW_BITBUCKET_PASSWORD
  if (!password) {
    throw new Error('Bitbucket repositories must supply `env.PEW_BITBUCKET_PASSWORD`')
  }

  core.setSecret(password)
  core.saveState('bitbucketPassword', password)

  const token = username + ':' + password
  const encodedToken = btoa(token)
  core.setSecret(encodedToken)


  const basicAuth = `Basic ${encodedToken}`

  const repositoryUri = new URL(repository)
  const parts = repositoryUri.pathname.split('/')
  if (parts.length !== 3) {
    throw new Error(`Malformed bitbucket repository '${repository}'`)
  }

  ///TODO(mendsley): Look into delegating access token to workflow-scoped
  const workspace = parts[1]
  const project = parts[2]

  const commitResponse = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${project}/refs?` +
    new URLSearchParams({
      q: `name="${ref}"`,
    }),
    {
      headers: {
        Authorization: basicAuth,
      },
    },
  )

  const commitData: any = await commitResponse.json()
  if (commitData.type === 'error') {
    throw new Error(commitData.error.message)
  }

  var commit: any = undefined
  const numCommits = commitData.values ? commitData.values.length : 0
  if (numCommits === 1 ) {
    commit = commitData.values[0].target
  } else if (numCommits > 1) {
    throw new Error(`Multiple commits resovled for ref '${ref}' ?!?!`)
  } else {
    // is the ref a SHA1 hash?
    if (!ref.match(/^[a-fA-F0-9]{40}$/)) {
      throw new Error(`Failed to find ref '${ref}'`)
    }

    const commitResponse = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${workspace}/${project}/commit/${ref}`,
      {
        headers: {
          Authorization: basicAuth,
        },
      },
    )

    const data: any = await commitResponse.json()
    if (data.type === 'error') {
      throw new Error(data.error.message)
    }

    commit = data
  }

  const commitSha = commit.hash
  const commitDate = new Date(commit.date)

  // fetch files
  var repoFiles: RepositoryFile[] = []
  for (const path of files) {
    const response = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${workspace}/${project}/src/${commitSha}/${path}`,
      {
        headers: {
          Authorization: basicAuth,
          Accept: 'application/json',
        },
      },
    )

    if (response.ok) {
      repoFiles.push({
        path: path,
        content: await response.text(),
      })
    } else {
      if (response.status !== 404) {
        throw new Error(`Failed to fetch '${path}': ${response.status}: ${response.statusText}`)
      }
    }
  }

  return {
    token: token,
    commit: commitSha,
    commitDate: commitDate,
    files: repoFiles,
  }
}

async function post(): Promise<void> {
  const password = core.getState('bitbucketPassword')
  if (password) {
    ///TODO(mendsley): Look into delegating access token to workflow-scoped
  }
}

export async function create() : Promise<SourceProvider> {
  return {
    getInfo: run,
    postAction: post,
  }
}
