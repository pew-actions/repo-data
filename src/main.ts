import * as core from '@actions/core'
import { RepositoryInfo, FileRequest, SourceProvider } from './types'
import * as buildname from './buildname'

// Providers
import * as github from './provider/github'

type SourceProviderFactory = () => Promise<SourceProvider>;

type SourceProviderMap  = {
  [key: string]: SourceProviderFactory;
};

const allProviders : SourceProviderMap = {
  github: github.create
}

async function run(): Promise<void> {

  core.saveState('isPost', true)

  try {

    const repository = core.getInput('repository')
    if (!repository) {
      core.setFailed('No repository supplied to the action')
      return
    }

    const ref = core.getInput('ref')
    if (!ref) {
      core.setFailed('No ref supplied to the action')
    }

    const provider = core.getInput('provider')
    if (!provider) {
      core.setFailed('No provider supplied to the action')
      return
    }

    // parse requested files
    const filePathToEnv = {}
    const fileParts = core.getInput('files').split(';')
    var files: FileRequest[] = []
    for (const fileDesc of fileParts) {
      const parts = fileDesc.split('|')
      if (parts.length === 2) {
        var path = parts[0].trim()
        var required = path.endsWith('!')
        if (required) {
          path = path.substr(0, path.length - 1)
        }

        const env = parts[1].trim()
        filePathToEnv[path] = env
        files.push({
          path: path,
          required: required,
        })
      }
    }

    const providerFactory = allProviders[provider.toLowerCase()]
    if (!providerFactory) {
      throw new Error(`Unknown provider '${provider}'`)
    }

    const providerImpl = await providerFactory()
    const repoInfo: RepositoryInfo = await providerImpl.getInfo(repository, ref, files)
    core.setOutput('token', repoInfo.token)
    core.setOutput('commit', repoInfo.commit)
    console.log(`Resolved ${ref} to: ${repoInfo.commit}`)

    // create a build name
    const buildName = await buildname.generate({
      ref: ref,
      commit: repoInfo.commit,
      date: new Date(),
    })
    core.setOutput('build-template', buildName.template)
    core.setOutput('build-short', buildName.short)
    console.log('Build names:')
    console.log(`  template: ${buildName.template}`)
    console.log(`  short: ${buildName.short}`)

    // export files
    for (const file of repoInfo.files) {
      const envForFile = filePathToEnv[file.path]
      if (!envForFile) {
        core.warning(`Provider exported unerequested file '${file.path}'`)
      } else {
        core.exportVariable(envForFile, file.content)
        console.log(`Exporting file '${file.path}' as environment variable '${envForFile}'`)
      }
    }

  } catch (err: any) {
    if (err instanceof Error) {
      const error = err as Error
      core.setFailed(error.message)
    } else {
      throw(err)
    }
  }
}

async function post() {
  for (const [name, factory] of Object.entries(allProviders)) {
    try {
      const impl = await factory()
      await impl.postAction()
    } catch (err: any) {
      if (err instanceof Error) {
        const error = err as Error
        core.warning(error.message)
      }
    }
  }
}

if (!core.getState('isPost')) {
  run()
} else {
  post()
}
