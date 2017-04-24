const collection = '_mocha_temp'
const id = 'mock_one'

module.exports = {
  async up (db, logger) {
    logger.verbose('Inserting id %s into collection %s.', id, collection)

    await db.collection(collection).insertOne({ id })
  },
  async down (db, logger) {
    logger.verbose('Removing id %s from collection %s.', id, collection)

    await db.collection(collection).removeOne({ id })
  }
}
