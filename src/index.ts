import fs from 'fs'
import path from 'path'
import util from 'util'
import {
  Adbm,
  AdbmAdapter,
  AdbmFactoryInjections,
  EnrichedMigrationObject,
  Logger,
  MigrationInfo,
  MigrationObject,
  DirectoryMigrationObjectRetrieverArguments,
  MigrationRunnerArguments,
  MigrationObjectRetriever,
} from './interfaces'

const readDirAsync = util.promisify(fs.readdir)
// eslint-disable-next-line no-console
const log = console.log.bind(console)

export const defaultLogger: Logger = {
  debug: log,
  info: log,
  // eslint-disable-next-line no-console
  warn: console.warn.bind(console),
  // eslint-disable-next-line no-console
  error: console.error.bind(console),
}

export const UP = 'up'
export const DOWN = 'down'

export const adbm = <Db = any>(
  db: Db,
  adapter: AdbmAdapter<Db>,
  injections: AdbmFactoryInjections = {},
): Adbm => {
  const {
    getMigrationObjects = getMigrationObjectsFromDirectory,
    metadata = '_adbm',
    logger = defaultLogger,
    validateAdapter: validate = validateAdapter,
    runMigrations = performMigrations,
  } = injections

  if (!db) {
    throw new Error(
      'You must pass a connected database driver instance to adbm()',
    )
  }

  validate(adapter)

  return async ({ direction = UP, exclude = [] } = {}) => {
    logger.debug(
      `○ Initializing database migrations, direction is ${direction}.`,
    )

    await adapter.init({ db, metadata, logger })

    const migrateUp = direction === UP
    const completed = await adapter.getCompletedMigrationIds({
      db,
      metadata,
      logger,
    })

    let migrations = await getMigrationObjects({
      logger,
      exclude: exclude.concat(migrateUp ? completed : []),
    })

    // Only keep objects for already completed migrations when migrating down
    if (!migrateUp) {
      migrations = migrations.filter(({ id }) => completed.includes(id))
    }

    if (migrations.length === 0) {
      logger.info('⚡ No pending database migrations.')

      return []
    }

    logger.debug(
      `○ Will attempt to perform ${migrations.length} migrations in total.`,
    )

    const ops = await runMigrations({
      migrations,
      direction,
      db,
      metadata,
      logger,
      registerSuccess: migrateUp
        ? adapter.registerMigration
        : adapter.unregisterMigration,
    })

    logger.info(
      `${
        migrateUp ? 'Applied' : 'Reverted'
      } the following database migrations:\n${ops
        .map(({ id, duration }) => `- ${id}: ${duration} sec`)
        .join('\n')}`,
    )

    return ops
  }
}

export const validateAdapter = (adapter: AdbmAdapter): void => {
  const requiredFunctions = [
    'init',
    'getCompletedMigrationIds',
    'registerMigration',
    'unregisterMigration',
  ]

  const missingFunctions = requiredFunctions.reduce((missing, func) => {
    if (typeof adapter[func] !== 'function') {
      return missing.concat([func])
    }

    return missing
  }, [])

  if (typeof adapter !== 'object' || missingFunctions.length > 0) {
    throw new Error(
      `Adapters must be an object implementing all of the following functions: ${requiredFunctions.join(
        ', ',
      )}`,
    )
  }
}

export const isValidMigrationObject = (obj: MigrationObject): boolean => {
  return (
    typeof obj === 'object' &&
    typeof obj[UP] === 'function' &&
    typeof obj[DOWN] === 'function'
  )
}

export const getMigrationObjectsFromDirectory: MigrationObjectRetriever<DirectoryMigrationObjectRetrieverArguments> = async (
  args = {},
) => {
  const {
    directory = 'migrations',
    exclude = [],
    verify = isValidMigrationObject,
    logger = defaultLogger,
  } = args

  const fullPath = path.resolve(directory)
  const files = await readDirAsync(fullPath)

  const ids = files
    .filter(file => file.endsWith('.js'))
    .map(file => file.slice(0, -3))

  logger.debug(
    `○ Directory ${fullPath} contains ${ids.length} valid migration files.`,
  )

  return ids
    .filter(id => !exclude.includes(id))
    .map(id => {
      const file = `${fullPath}/${id}.js`

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const obj = require(file)

        if (!verify(obj)) {
          throw new Error(
            `Not a valid migration file (must export "${UP}" and "${DOWN}" functions).`,
          )
        }

        return { ...obj, id }
      } catch (e) {
        logger.error(
          `❌ Failed to include migration file ${file}: ${e.message}`,
        )
      }
    })
    .filter(obj => !!obj) as EnrichedMigrationObject[]
}

export const performMigrations = async <Db = any>({
  migrations,
  direction,
  db,
  metadata,
  registerSuccess,
  logger = defaultLogger,
}: MigrationRunnerArguments<Db>): Promise<MigrationInfo[]> => {
  const migrateUp = direction === UP
  const arrow = migrateUp ? '↗' : '↘'
  const action = migrateUp ? 'Applying' : 'Reverting'

  // avoid mutating passed array
  const objects = migrateUp ? migrations : [...migrations].reverse()
  const ops = []

  for (const { [direction]: fn, id } of objects) {
    logger.debug(`${arrow} ${action} migration "${id}"`)

    const then = new Date()

    await fn(db, logger)

    const now = new Date()
    const duration = ((now.getTime() - then.getTime()) / 1000).toFixed(3)

    logger.debug(`✔ Migration ${id} successful, took ${duration} sec.`)

    await registerSuccess({ id, db, metadata, logger })

    ops.push({ id, duration })
  }

  return ops
}
