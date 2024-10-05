import { BuildDescription, BuildName } from './types'
import * as wordlist from './wordlist'

const template = '{project-name}-{datetime}-{hash}-{shortname}+{platform}+{configuration}+{branch}'

export async function generate(desc: BuildDescription): Promise<BuildName> {
  const logDateYear = (desc.date.getUTCFullYear() % 100).toString().padStart(2, '0')
  const logDateMonth = (desc.date.getUTCMonth() + 1).toString().padStart(2, '0')
  const logDateDate = desc.date.getUTCDate().toString().padStart(2, '0')
  const logDateHour = desc.date.getUTCHours().toString().padStart(2, '0')
  const logDateMinute = desc.date.getUTCMinutes().toString().padStart(2, '0')
  const logDateSecond = desc.date.getUTCSeconds().toString().padStart(2, '0')

  const longDate = `${logDateYear}${logDateMonth}${logDateDate}-${logDateHour}${logDateMinute}${logDateSecond}`
  const shortDate = `${logDateMonth}${logDateDate}`

  const gitHash = desc.commit.substr(0,7).toLowerCase()

  var templateName = template
  templateName = templateName.replace('{hash}', gitHash)

  const runNumber = process.env.GITHUB_RUN_NUMBER
  const numberedBranchName = `${desc.ref}${runNumber}`

  templateName = templateName.replace('{datetime}', longDate)
  templateName = templateName.replace('{branch}', numberedBranchName)

  const shortName = shortDate + wordlist.generate(templateName)
  templateName = templateName.replace('{shortname}', shortName)

  return {
    template: templateName,
    short: shortName,
  }
}
