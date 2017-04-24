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

function adbm (db, { collection = '_migrations', directory = 'migrations', logger = defaultLogger } = { }) {
  if (!db || typeof db !== 'object' || typeof db.collection !== 'function') {
    throw new Error('You must pass a connected mongodb driver instance to adbm()')
  }

  return async (direction = UP) => {
    logger.verbose('Initializing database migrations, direction is %s.', direction)

    // const migrateUp = direction === UP
    const completed = await getCompletedMigrationIds(db, collection)

    logger.debug('Found %s completed migrations in collection "%s".', completed.length, collection)

    // const objects = getMigrationObjects(directory, migrateUp ? completed : [ ], isValidMigrationObject, logger)
  }
}

async function getCompletedMigrationIds (db, collection) {
  const migrations = await db.collection(collection).find({ }, { id: true }).toArray()

  return migrations.map(({ id }) => id)
}

function isValidMigrationObject (obj) {
  return typeof obj === 'object' && typeof obj[UP] === 'function' && typeof obj[DOWN] === 'function'
}

async function getMigrationObjects (directory, exclude = [ ], verify = isValidMigrationObject, logger = defaultLogger) {
  const fullPath = path.resolve(directory)
  const files = await readDirAsync(fullPath)

  const ids = files
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.slice(0, -3))
    .filter((id) => !exclude.includes(id))

  logger.debug('Found %s migrations in directory %s', ids.length, fullPath)

  return ids.map((id) => {
    const file = `${fullPath}/${id}.js`

    try {
      const obj = require(file)

      if (!verify(obj)) {
        throw new Error('Not a valid migration file (must export "up" and "down" functions).')
      }

      return Object.assign({ }, obj, { id })
    } catch (e) {
      logger.error('Failed to include migration file %s: %s', file, e.message)

      return false
    }
  }).filter((obj) => obj !== false)
}

async function registerMigration (id, db, collection) {
  await db.collection(collection).insertOne({ id, completed: new Date() })
}

async function unregisterMigration (id, db, collection) {
  await db.collection(collection).removeOne({ id })
}

async function performMigrations (migrations, direction, db, collection, registerSuccess = registerMigration, logger = defaultLogger) {
  return Promise.mapSeries(migrations, async ({ [direction]: fn, id }) => {
    const then = new Date()

    await fn(db, logger)

    const now = new Date()

    await registerSuccess(id, db, collection)

    return { id, duration: (now - then).toFixed(4) }
  })
}

module.exports = {
  UP,
  DOWN,
  adbm,
  getCompletedMigrationIds,
  isValidMigrationObject,
  getMigrationObjects,
  registerMigration,
  unregisterMigration,
  performMigrations
}
