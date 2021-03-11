import { AdbmFactoryInjections } from './adbm'

export type RegistrationFn<Db = any> = (
  args: {
    id: string
    db: Db
  } & Pick<AdbmFactoryInjections, 'metadata' | 'logger'>,
) => any

export type InitFn<Db = any> = (
  args: { db: Db } & Omit<
    AdbmFactoryInjections,
    'adapter' | 'getMigrationObjects'
  >,
) => any

export type CompletedMigrationIdsRetriever<Db = any> = (
  args: { db: Db } & Pick<AdbmFactoryInjections, 'metadata' | 'logger'>,
) => Promise<string[]>

export interface AdbmAdapter<Db = any> {
  init: InitFn<Db>
  getCompletedMigrationIds: CompletedMigrationIdsRetriever<Db>
  registerMigration: RegistrationFn<Db>
  unregisterMigration: RegistrationFn<Db>
}
