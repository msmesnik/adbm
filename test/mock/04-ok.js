const collection = '_mocha_temp'
const id = 'mock_three'

module.exports = {
  failVerify: true, // used in one test to mock a failed verification, not actually part of the migration object api
  async up (db, logger) {
    logger.verbose('Inserting id %s into collection %s.', id, collection)

    await db.collection(collection).insertOne({ id })
  },
  async down (db, logger) {
    logger.verbose('Removing id %s from collection %s.', id, collection)

    await db.collection(collection).removeOne({ id })
  }
}
