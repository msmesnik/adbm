import { AdbmAdapter, RegistrationFn } from './adapter'

type LogFn = (msg: string) => void

export type MigrationDirection = 'up' | 'down'

export interface Logger {
  debug: LogFn
  info: LogFn
  warn: LogFn
  error: LogFn
}

export interface AdbmFactoryInjections {
  metadata?: string
  getMigrationObjects?: MigrationObjectRetriever
  logger?: Logger
  validateAdapter?: (adapter: AdbmAdapter) => void
  runMigrations?: (args: MigrationRunnerArguments) => Promise<MigrationInfo[]>
}

export interface AdbmArguments {
  direction?: MigrationDirection
  exclude?: string[]
}

export type Adbm = (args?: AdbmArguments) => Promise<MigrationInfo[]>

type MigrationFn = <Db = any>(db: Db, logger: Logger) => any

export interface MigrationObject {
  up: MigrationFn
  down: MigrationFn
}

export interface EnrichedMigrationObject extends MigrationObject {
  id: string
}

export interface MigrationObjectRetrieverArguments {
  exclude?: string[]
  verify?: (obj: MigrationObject) => boolean
  logger?: Logger
}

export type MigrationObjectRetriever<
  Args extends MigrationObjectRetrieverArguments = MigrationObjectRetrieverArguments
> = (
  args: Args,
) => EnrichedMigrationObject[] | Promise<EnrichedMigrationObject[]>

export interface DirectoryMigrationObjectRetrieverArguments
  extends MigrationObjectRetrieverArguments {
  directory?: string
}

export interface MigrationInfo {
  id: string
  duration: string
}

export interface MigrationRunnerArguments<Db = any> {
  migrations: EnrichedMigrationObject[]
  direction: MigrationDirection
  db: Db
  metadata: string
  registerSuccess: RegistrationFn
  logger?: Logger
}
