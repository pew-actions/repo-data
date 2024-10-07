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

  const basicAuth = `Basic ${ btoa(username + ':' + password) }`
  core.setSecret(basicAuth)

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

  if (!commitData.values || commitData.values.length !== 1) {
    throw new Error(`Failed to find ref '${ref}'`)
  }

  const commitSha = commitData.values[0].target.hash
  const commitDate = new Date(commitData.values[0].target.date)

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
    token: basicAuth,
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
