export type FileRequest = {
  path: string
  required: boolean
}

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
  getInfo: (repository: string, ref: string, files: FileRequest[]) => Promise<RepositoryInfo>
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
}
