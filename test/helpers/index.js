const mongodb = require('mongodb')

const dbUri = process.env.DB_URI || 'mongodb://localhost/migro'

let db

async function getConnection () {
  if (!db) {
    db = await mongodb.connect(dbUri)
  }

  return db
}

module.exports = {
  getConnection
}
