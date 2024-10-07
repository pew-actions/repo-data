import * as core from '@actions/core'
import { Octokit } from '@octokit/core'
import { App as GithubApp } from '@octokit/app'
import { getOctokit } from '@actions/github'
import { RepositoryInfo, RepositoryFile, SourceProvider } from '../types'

async function run(repository: string, ref: string, files: string[]): Promise<RepositoryInfo> {
  // validate GitHub inputs
  const applicationId = process.env.PEW_GITHUB_APPID || '239145'
  if (!applicationId) {
    throw new Error('GitHub repositories must supply `env.PEW_GITHUB_APPID`')
  }

  const privateKey = process.env.PEW_GITHUB_KEY
  if (!privateKey) {
    throw new Error('GitHub repositories must supply `env.PEW_GITHUB_KEY`')
  }

  const parts = repository.split('/')
  if (parts.length !== 2) {
    throw new Error(`Invalid repository format for '${repository}'`)
  }
  const repositoryOwner = parts[0]
  const repositoryName = parts[1]

  const app = new GithubApp({
    appId: applicationId,
    privateKey: privateKey,
  })

  {
    const { data } = await app.octokit.request('/app')
    console.log(`Authenticated as application '${ data.name }'`)
  }

  // find the installation id for the repository
  console.log(`Determining installation id for repository '${repository}'`)
  var installationId: number | null = null
  for await (const {installation} of app.eachInstallation.iterator()) {
    if (installation.account!.login!.toLowerCase() === repositoryOwner.toLowerCase()) {
      installationId = installation.id
      break
    }
  }
  if (!installationId) {
    throw new Error(`Failed to find installation id for '${repository}'`)
  }

  // create an access token for the repository
  const octokit = await app.getInstallationOctokit(installationId)
  const { data: accessTokenData } = await octokit.request('POST /app/installations/{installation_id}/access_tokens', {
    installation_id: installationId,
    repositories: [repositoryName], ///TODO(mendsley): Add support for additional repositories
    permissions: {
      contents: 'read',
    },
  })

  core.setSecret(accessTokenData.token)
  core.saveState('githubToken', accessTokenData.token)

  // output repositories with permissions
  const actualRepositories = (accessTokenData.repositories || [{full_name: 'all'}]).map(
    function(repository) { return repository.full_name }
  )
  console.log(`Access token granted for ${actualRepositories}`)

  // reformat pull requests to a git ref name
  var commitRef = ref
  const rePullRequest = /^(\d+)\/merge$/
  const pullRequestMatch = commitRef.match(rePullRequest)
  if (pullRequestMatch && process.env.GITHUB_EVENT_NAME === 'pull_request') {
    commitRef = `refs/pull/${pullRequestMatch[1]}/head`
  }

  // determine the checkout ref
  const github = getOctokit(accessTokenData.token)
  const { data: commitResponse } = await github.rest.repos.getCommit({
    owner: repositoryOwner,
    repo: repositoryName,
    ref: commitRef,
  })

  const commitSha = commitResponse.sha
  const commitDate = commitResponse.commit.committer!.date!

  // get files
  var repoFiles: RepositoryFile[] = []
  for (const path of files) {
    try {
      const { data } = await github.rest.repos.getContent({
        owner: repositoryOwner,
        repo: repositoryName,
        ref: commitSha,
        path: path,
      })

      const buffer = Buffer.from((data as any).content, (data as any).encoding)
      repoFiles.push({
        path: path,
        content: buffer.toString(),
      })
    } catch (err: any) {
      if (err.name !== 'HttpError' || err.status !== 404 ) {
        core.error(`Failed to get file '${path}'`)
        throw err
      }
    }
  }

  return {
    token: accessTokenData.token,
    commit: commitSha,
    commitDate: new Date(commitDate),
    files: repoFiles,
  }
}

async function post() {
  // revoke GitHub token
  const githubToken = core.getState('githubToken')
  if (githubToken) {
    const octokit = new Octokit({
      auth: githubToken,
    })

    await octokit.request('DELETE /installation/token', {})
    console.log('Revoked GitHub access token')
  }
}

export async function create() : Promise<SourceProvider> {
  return {
    getInfo: run,
    postAction: post,
  }
}
