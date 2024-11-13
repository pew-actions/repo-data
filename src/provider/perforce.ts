import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import { RepositoryInfo, RepositoryFile, SourceProvider } from '../types'

function validateRef(ref: string): boolean {
  if (ref === '#head') {
    return true
  }

  const changelistRegexp = /^@\d+$/
  if (ref.match(changelistRegexp)) {
return true
  }

  return false
}


type P4Opts = {
  args: string[]
  env?: {[key: string]: string}
}

async function runCmd(cmd: string, opts: P4Opts): Promise<void> {
  const exitCode = await exec.exec(cmd, opts.args, {
    env: opts.env,
  })
  if (exitCode !== 0) {
    throw new Error(`p4.exe returned error ${exitCode}`)
  }
}

async function runP4(opts: P4Opts): Promise<void> {
  const exitCode = await exec.exec('p4.exe', opts.args, {
    env: opts.env,
  })
  if (exitCode !== 0) {
    throw new Error(`p4.exe returned error ${exitCode}`)
  }
}

async function runP4JSON(opts: P4Opts): Promise<any> {
  let output = ''

  const args = ['-Mj', '-Ztag'].concat(opts.args)
  const exitCode = await exec.exec('p4.exe', args, {
    env: opts.env,
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      },
    },
  })
  if (exitCode !== 0) {
    throw new Error(`p4.exe returned error ${exitCode}`)
  }

  return output.split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
}

async function run(repositories: string[], ref: string, files: string[]): Promise<RepositoryInfo> {

  if (repositories.length > 1) {
    throw new Error('Perforce provider only supports a single repository')
  }
  if (files.length > 0) {
    throw new Error('Perforce provider does not support fetching files yet')
  }

  if (!validateRef(ref)) {
    throw new Error(`Unsupported perforce ref '${ref}'`)
  }

  const p4user = process.env.PEW_P4USER
  if (!p4user) {
    throw new Error(`Repository must set the PEW_P4USER secret at https://github.com/${process.env.GITHUB_REPOSITORY}/settings/secrets/actions`)
  }

  const p4pass = process.env.PEW_P4PASS
  if (!p4pass) {
    throw new Error(`Repository must set the PEW_P4PASS secret at https://github.com/${process.env.GITHUB_REPOSITORY}/settings/secrets/actions`)
  }

  const p4clientTemplate = process.env.PEW_P4_CLIENT_TEMPLATE
  if (!p4clientTemplate) {
    throw new Error('Repository must set the p4-client-template input in its workflow')
  }

  // add trust for P4 server
  const perforceServer = repositories[0]
  if (perforceServer.startsWith('ssl:')) {
    const fingerprint = process.env.PEW_P4PORT_FINGERPRINT
    if (!fingerprint) {
      throw new Error(`Repository must set the PEW_P4PORT_FINGERPRINT variable at https://github.com/${process.env.GITHUB_REPOSITORY}/settings/variables/actions`)
    }

    core.startGroup('Set P4 trust fingerprint')
    await runP4({
      args: ['trust', '-i', fingerprint],
      env: {
        P4PORT: perforceServer,
      },
    })
    core.endGroup()

    core.saveState('p4-trust-port', perforceServer)
  }

  const p4env = {
    P4PORT: perforceServer,
    P4USER: p4user,
  }

  // login to the perforce server
  core.startGroup('Login to P4 server')
  const tempFile = path.join(__dirname, '.p4auth')
  try {
    fs.writeFileSync(tempFile, p4pass, {mode: 0o400})
    console.log(tempFile)
    await runCmd('cmd.exe', {
      args: ['/C', `p4 login < ${tempFile}`],
      env: {
        P4PORT: p4env.P4PORT,
        P4USER: p4env.P4USER,
        P4PASSWD: tempFile,
      },
    })

    core.saveState('p4-login-port', perforceServer)
    core.saveState('p4-login-user', p4user)
  } finally {
    fs.rmSync(tempFile, {force: true})
  }
  core.endGroup()

  core.startGroup('Get template workspace')
  const clientSpecs = await runP4JSON({
    args: ['client', '-o', p4clientTemplate],
    env: p4env,
  })
  core.endGroup()
  const clientSpec = clientSpecs[0]!

  // get the set of files to check
  const viewSpec: string[] = []
  for (const key in clientSpec) {
    if (key.startsWith('View')) {
      const view = clientSpec[key].split(' ')
      if (view.length !== 2) {
        throw new Error(`Malformed client view '${view}'`)
      }

      viewSpec.push(view[0] + ref)
    }
  }

  core.startGroup('Get changelist')
  const changes = await runP4JSON({
    args: ['changes', '-m1', '-t'].concat(viewSpec),
    env: p4env,
  })
  core.endGroup()

  // get the latest changeset
  let recentChange: any = null
  for (const change of changes) {
    const cl = parseInt(change.change)
    if (!recentChange || cl > recentChange.change) {
      recentChange = change
    }
  }
  if (!recentChange) {
    throw new Error('Failed to find a suitable changelist')
  }

  const clDate = new Date(recentChange.time * 1000)

  return {
    commit: `@${recentChange.change}`,
    commitDate: clDate,
    token: 'p4ticket',
    files: [],
  }
}

async function post(): Promise<void> {
  // logout from server
  const loginServer = core.getState('p4-login-port')
  const loginUser = core.getState('p4-login-user')
  if (loginServer && loginUser) {
    core.startGroup('Logout from P4')
    try {
      await runP4({
        args: ['logout'],
        env: {
          P4PORT: loginServer,
          P4USER: loginUser,
        }
      })
    } catch {
      // ignore errors
    }
    core.endGroup()
  }

  // revoke trust to server
  const trustServer = core.getState('p4-trust-port')
  if (trustServer) {
    core.startGroup('Revoke P4 trust')
    try {
      await runP4({
        args: ['trust', '-d'],
        env: {
          P4PORT: trustServer,
        },
      })
    } catch {
      // ignore errors
    }
    core.endGroup()
  }
}

export async function create() : Promise<SourceProvider> {
  return {
    getInfo: run,
    postAction: post,
  }
}

