import * as core from '@actions/core'
import { Gitlab } from '@gitbeaker/rest'
import { RepositoryInfo, RepositoryFile, SourceProvider } from '../types'

async function run(repository: string, ref: string, files: string[]): Promise<RepositoryInfo> {
  // validate Gitlab inputs
  const token = process.env.PEW_GITLAB_TOKEN
  if (!token) {
    throw new Error('Gitlab repositories must supply `env.PEW_GITLAB_TOKEN`')
  }

  const repositoryUri = new URL(repository)
  const projectName = repositoryUri.pathname.substr(1)

  const api = new Gitlab({
    host: repositoryUri.origin,
    token: token,
  })

  const commits = await api.Commits.all(projectName, {
    all: false,
    perPage: 1,
    maxPages: 1,
    refName: ref,
  })
  if (commits.length !== 1) {
    throw new Error(`Failed to find ref '${ref}'`)
  }

  ///TODO(mendsley): Look into delegating access token to workflow-scoped
  core.setSecret(token)
  core.saveState('gitlabToken', token)

  const commitSha = commits[0].id

  // fetch files
  var repoFiles: RepositoryFile[] = []
  for (const path of files) {
    try {
      const { content } = await api.RepositoryFiles.show(
        projectName,
        path,
        commitSha,
      )

      const buffer = Buffer.from(content, 'base64')
      repoFiles.push({
        path: path,
        content: buffer.toString(),
      })
    } catch (err: any) {
      if (err.name !== 'GitbeakerRequestError' || err.cause.response.status !== 404) {
        core.error(`Failed to get file '${path}'`)
        throw err
      }
    }
  }

  return {
    token: token,
    commit: commitSha,
    commitDate: new Date(commits[0].committed_date!),
    files: repoFiles,
  }
}

async function post(): Promise<void> {
  const token = core.getState('gitlabToken')
  if (token) {
    ///TODO(mendsley): Look into delegating access token to workflow-scoped
  }
}

export async function create() : Promise<SourceProvider> {
  return {
    getInfo: run,
    postAction: post,
  }
}

