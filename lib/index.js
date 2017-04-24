const Promise = require('bluebird')
const fs = require('fs')
const path = require('path')

const readDirAsync = Promise.promisify(fs.readdir)

const log = console.log.bind(console)
const defaultLogger = {
  debug: log,
  verbose: log,
  info: log,
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

const UP = 'up'
const DOWN = 'down'

function adbm ({ db, adapter, metadata = '_migrations', directory = 'migrations', logger = defaultLogger } = { }) {
  if (!db) {
    throw new Error('You must pass a connected database driver instance to adbm()')
  }

  validateAdapter(adapter)

  return async ({ direction = UP, exclude = [ ] } = { }) => {
    logger.verbose('○ Initializing database migrations, direction is %s.', direction)

    await adapter.init({ db, metadata, directory, logger })

    const migrateUp = direction === UP
    const completed = await adapter.getCompletedMigrationIds({ db, metadata, logger })

    let migrations = await getMigrationObjects({ directory, logger, exclude: exclude.concat(migrateUp ? completed : [ ]) })

    // Only keep objects for already completed migrations when migrating down
    if (!migrateUp) {
      migrations = migrations.filter(({ id }) => completed.includes(id))
    }

    if (migrations.length === 0) {
      logger.info('⚡ No pending database migrations.')

      return [ ]
    }

    logger.debug('○ Will attempt to perform %s migrations in total.', migrations.length)

    const ops = await performMigrations({ migrations, direction, db, metadata, logger, registerSuccess: migrateUp ? adapter.registerMigration : adapter.unregisterMigration })

    logger.info('%s the following database migrations:\n%s', migrateUp ? 'Applied' : 'Reverted', ops.map(({ id, duration }) => `- ${id}: ${duration} sec`).join('\n'))

    return ops
  }
}

function validateAdapter (adapter) {
  const requiredFunctions = [ 'init', 'getCompletedMigrationIds', 'registerMigration', 'unregisterMigration' ]

  const missingFunctions = requiredFunctions.reduce((missing, func) => {
    if (typeof adapter[func] !== 'function') {
      return missing.concat([ func ])
    }

    return missing
  }, [ ])

  if (typeof adapter !== 'object' || missingFunctions.length > 0) {
    throw new Error('Adapters must be an object implementing all of the following functions: %s', requiredFunctions.join(', '))
  }
}

function isValidMigrationObject (obj) {
  return typeof obj === 'object' && typeof obj[UP] === 'function' && typeof obj[DOWN] === 'function'
}

async function getMigrationObjects ({ directory, exclude = [ ], verify = isValidMigrationObject, logger = defaultLogger }) {
  const fullPath = path.resolve(directory)
  const files = await readDirAsync(fullPath)

  const ids = files
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.slice(0, -3))

  logger.debug('○ Directory %s contains %s valid migration files.', fullPath, ids.length)

  return ids
    .filter((id) => !exclude.includes(id))
    .map((id) => {
      const file = `${fullPath}/${id}.js`

      try {
        const obj = require(file)

        if (!verify(obj)) {
          throw new Error(`Not a valid migration file (must export "${UP}" and "${DOWN}" functions).`)
        }

        return Object.assign({ }, obj, { id })
      } catch (e) {
        logger.error('❌ Failed to include migration file %s: %s', file, e.message)

        return false
      }
    })
    .filter((obj) => obj !== false)
}

async function performMigrations ({ migrations, direction, db, metadata, registerSuccess, logger = defaultLogger }) {
  const migrateUp = direction === UP
  const arrow = migrateUp ? '↗' : '↘'
  const action = migrateUp ? 'Applying' : 'Reverting'

  return Promise.mapSeries(migrations, async ({ [direction]: fn, id }) => {
    logger.debug('%s %s migration "%s"', arrow, action, id)

    const then = new Date()

    await fn(db, logger)

    const now = new Date()
    const duration = ((now - then) / 1000).toFixed(3)

    logger.debug('✔ Migration %s successful, took %s sec.', id, duration)

    await registerSuccess({ id, db, metadata, logger })

    return { id, duration }
  })
}

module.exports = {
  UP,
  DOWN,
  defaultLogger,
  adbm,
  isValidMigrationObject,
  getMigrationObjects,
  performMigrations,
  validateAdapter
}
