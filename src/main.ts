import * as core from '@actions/core'
import { RepositoryInfo, SourceProvider } from './types'
import * as buildname from './buildname'

// Providers
import * as github from './provider/github'
import * as gitlab from './provider/gitlab'
import * as bitbucket from './provider/bitbucket'
import * as perforce from './provider/perforce'

type SourceProviderFactory = () => Promise<SourceProvider>;

type SourceProviderMap  = {
  [key: string]: SourceProviderFactory;
};

const allProviders : SourceProviderMap = {
  github: github.create,
  gitlab: gitlab.create,
  bitbucket: bitbucket.create,
  perforce: perforce.create,
}

async function run(): Promise<void> {

  core.saveState('isPost', true)

  try {

    const repositories = core.getInput('repositories').split(';')
    if (!repositories) {
      core.setFailed('No repository supplied to the action')
      return
    }

    const ref = core.getInput('ref')
    if (!ref) {
      core.setFailed('No ref supplied to the action')
      return
    }

    const provider = core.getInput('provider')
    if (!provider) {
      core.setFailed('No provider supplied to the action')
      return
    }

    // parse requested files
    const filePathToEnv: Map<string, string> = new Map()
    const requiredFiles: Set<String> = new Set()
    const fileParts = core.getInput('files').split(';')
    for (const fileDesc of fileParts) {
      const parts = fileDesc.split('|')
      if (parts.length === 2) {
        var path = parts[0].trim()
        var required = path.endsWith('!')
        if (required) {
          path = path.substr(0, path.length - 1)
        }

        const env = parts[1].trim()
        filePathToEnv.set(path, env)
        if (required) {
          requiredFiles.add(path)
        }
      }
    }

    const providerFactory = allProviders[provider.toLowerCase()]
    if (!providerFactory) {
      throw new Error(`Unknown provider '${provider}'`)
    }

    const providerImpl = await providerFactory()
    const repoInfo: RepositoryInfo = await providerImpl.getInfo(repositories, ref, Array.from(filePathToEnv.keys()))
    core.setOutput('token', repoInfo.token)
    core.setOutput('commit', repoInfo.commit)
    console.log(`Resolved ${ref} to: ${repoInfo.commit}`)

    // create a build name
    const buildName = await buildname.generate({
      ref: ref,
      commit: repoInfo.commit,
      date: repoInfo.commitDate,
    })
    core.setOutput('build-template', buildName.template)
    core.setOutput('build-short', buildName.short)
    core.setOutput('build-components', JSON.stringify(buildName))
    console.log('Build names:')
    console.log(`  template: ${buildName.template}`)
    console.log(`  short: ${buildName.short}`)
    console.log('---- Components ----')
    console.log(JSON.stringify(buildName, null, 2))

    // export files
    for (const file of repoInfo.files) {
      const envForFile = filePathToEnv.get(file.path)
      if (!envForFile) {
        core.warning(`Provider exported unerequested file '${file.path}'`)
      } else {
        core.exportVariable(envForFile, file.content)
        console.log(`Exporting file '${file.path}' as environment variable '${envForFile}'`)
        requiredFiles.delete(file.path)
      }
    }

    if (requiredFiles.size > 0) {
      const files = Array.from(requiredFiles.keys()).map(path => `\`${path}\``)
      throw new Error(`Failed to export required files: ${files.join(', ')}`)
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
