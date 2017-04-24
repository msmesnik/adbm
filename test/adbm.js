/* eslint-env mocha */

const { expect } = require('chai')

const { getConnection } = require('./helpers')
const lib = require('../lib')

describe('migrations', function () {
  let db
  const mockInfoCollection = '_mocha_mock_migrations'
  const getIds = (items) => items.map(({ id }) => id)
  const cleanup = async () => {
    await db.collection(mockInfoCollection).drop()
  }

  before(async () => {
    db = await getConnection()
  })

  describe('general functionality', function () {
    before(async () => {
      await db.collection(mockInfoCollection).insertMany([
        { id: 'first', completed: new Date() },
        { id: 'second', completed: new Date() }
      ])
    })
    after(cleanup)

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
      const migrations = await lib.getMigrationObjects({ directory: 'test/mock', exclude: [ '02-invalid' ], verify: ({ failVerify }) => !(failVerify === true) })

      expect(migrations).to.be.an('array')

      const ids = getIds(migrations)
      expect(ids).to.have.all.members([ '01-ok', '03-ok' ])
      expect(ids).to.not.have.members([ '02-invalid', 'ignored', '04-ok' ])
    })

    it('registers a successful migration', async function () {
      const mockId = 'mock'
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.not.contain(mockId)

      await lib.registerMigration({ id: mockId, collection: mockInfoCollection, db })
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.contain(mockId)
    })

    it('removes an entry from the list of performed migrations', async function () {
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.contain('first')

      await lib.unregisterMigration({ id: 'first', collection: mockInfoCollection, db })
      expect(getIds(await db.collection(mockInfoCollection).find().toArray())).to.not.contain('first')
    })
  })

  describe('running migrations', function () {
    const collection = '_mocha_temp'
    let migrate
    // const migrate = lib.adbm(db, { collection: mockInfoCollection, directory: 'test/mock' })

    before(() => {
      migrate = lib.adbm(db, { collection: mockInfoCollection, directory: 'test/mock' })
    })
    after(async () => {
      await cleanup()
      await db.collection(collection).drop()
    })

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

      const ops = await lib.performMigrations({ migrations, direction: 'up', db, collection: mockInfoCollection, registerSuccess: noop })

      expect(ops).to.be.an('array')
      expect(ops.length).to.equal(2)

      expect(first).to.equal(1)
      expect(second).to.equal(2)
    })

    it('applies pending migrations', async function () {
      await migrate('up', { exclude: [ '03-ok' ] })

      const first = await db.collection(collection).find().toArray()
      expect(first.length).to.equal(2)

      await migrate()
      const second = await db.collection(collection).find().toArray()
      expect(second.length).to.equal(3)
    })

    it('reverts applied migrations', async function () {
      await migrate('down', { exclude: [ '03-ok' ] })

      const first = await db.collection(collection).find().toArray()
      expect(first.length).to.equal(1)

      await migrate('down')
      const second = await db.collection(collection).find().toArray()
      expect(second.length).to.equal(0)
    })
  })
})
