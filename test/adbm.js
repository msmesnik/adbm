/* eslint-env mocha */

const { expect } = require('chai')

const { getConnection } = require('./helpers')
const lib = require('../lib')

describe('migrations', function () {
  let db
  const mockInfoCollection = '_mocha_mock_migrations'

  before(async () => {
    db = await getConnection()
  })

  describe('general functionality', function () {
    const getIds = (items) => items.map(({ id }) => id)

    before(async () => {
      await db.collection(mockInfoCollection).insertMany([
        { id: 'first', completed: new Date() },
        { id: 'second', completed: new Date() }
      ])
    })
    after(async () => {
      await db.collection(mockInfoCollection).drop()
    })

    it('requires a mongodb driver object', async function () {
      expect(() => lib.adbm()).to.throw()
      expect(() => lib.adbm(db)).to.not.throw()
    })

    it('gets a list of all completed migrations', async function () {
      const ids = await lib.getCompletedMigrationIds(db, mockInfoCollection)

      expect(ids).to.be.an('array')
      expect(ids).to.have.all.members([ 'first', 'second' ])
    })

    it('requires migration objects to have "up" and "down" functions', function () {
      const up = () => undefined
      const down = () => undefined

      expect(lib.isValidMigrationObject()).to.equal(false)
      expect(lib.isValidMigrationObject(1)).to.equal(false)
      expect(lib.isValidMigrationObject('a')).to.equal(false)
      expect(lib.isValidMigrationObject(up)).to.equal(false)
      expect(lib.isValidMigrationObject({})).to.equal(false)
      expect(lib.isValidMigrationObject({ up })).to.equal(false)
      expect(lib.isValidMigrationObject({ down })).to.equal(false)
      expect(lib.isValidMigrationObject({ up, down })).to.equal(true)
    })

    it('reads migration files fron a directory', async function () {
      // excludes id "02-invalid" and makes id "04-ok" fail verificytion
      const migrations = await lib.getMigrationObjects('test/mock', [ '02-invalid' ], ({ failVerify }) => !(failVerify === true))

      expect(migrations).to.be.an('array')

      const ids = getIds(migrations)
      expect(ids).to.have.all.members([ '01-ok', '03-ok' ])
      expect(ids).to.not.have.members([ '02-invalid', 'ignored', '04-ok' ])
    })

    it('registers a successful migration', async function () {
      const mockId = 'mock'
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.not.contain(mockId)

      await lib.registerMigration(mockId, db, mockInfoCollection)
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.contain(mockId)
    })

    it('removes an entry from the list of performed migrations', async function () {
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.contain('first')

      await lib.unregisterMigration('first', db, mockInfoCollection)
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.not.contain('first')
    })
  })

  describe('running migrations', function () {
    it('runs a list of migrations in order', async function () {
      const noop = () => undefined
      let num = 0
      let first
      let second

      const migrations = [
        {
          id: 'one',
          up: () => {
            return new Promise((resolve) => {
              setTimeout(() => {
                first = ++num
                resolve()
              }, 250)
            })
          },
          down: noop
        },
        {
          id: 'two',
          up: () => {
            second = ++num
          },
          down: noop
        }
      ]

      const ops = await lib.performMigrations(migrations, 'up', db, mockInfoCollection, noop)

      expect(ops).to.be.an('array')
      expect(ops.length).to.equal(2)

      expect(first).to.equal(1)
      expect(second).to.equal(2)
    })
  })
})
