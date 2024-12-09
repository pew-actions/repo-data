export type RepositoryFile = {
  path: string
  content: string
}

export type RepositoryInfo = {
  commit: string
  commitDate: Date
  token: string
  files: RepositoryFile[]
}

export interface SourceProvider {
  getInfo: (repositories: string[], ref: string, files: string[]) => Promise<RepositoryInfo>
  postAction: () => Promise<void>
}

export type BuildDescription = {
  ref: string
  commit: string
  date: Date
}

export type BuildName = {
  template: string
  short: string
  time: Date
  ref: string
  commit: string
  build: string
}
