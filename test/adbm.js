/* eslint-env mocha */

const { expect } = require('chai')
const adapter = require('adbm-mongodb')
const sinon = require('sinon')

const { getConnection } = require('./helpers')
const lib = require('../lib/adbm')

describe('migrations', function () {
  let db
  const noop = () => undefined
  const mockInfoCollection = '_mocha_mock_migrations'
  const getIds = (items) => items.map(({ id }) => id)

  before(async () => {
    db = await getConnection()
  })

  describe('general functionality', function () {
    it('requires a database driver object', async function () {
      expect(() => lib.adbm()).to.throw()
      expect(() => lib.adbm({ db, adapter })).to.not.throw()
    })

    it('validates an adapter object', function () {
      expect(() => lib.validateAdapter({ })).to.throw()
      expect(() => lib.validateAdapter({ init: noop })).to.throw()
      expect(() => lib.validateAdapter({ init: noop, getCompletedMigrationIds: noop })).to.throw()
      expect(() => lib.validateAdapter({ init: noop, getCompletedMigrationIds: noop, registerMigration: noop })).to.throw()
      expect(() => lib.validateAdapter({ init: noop, getCompletedMigrationIds: noop, registerMigration: noop, unregisterMigration: noop })).to.not.throw()
    })

    it('requires migration objects to have "up" and "down" functions', function () {
      const up = noop
      const down = noop

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
  })

  describe('running migrations', function () {
    const collection = '_mocha_temp'
    let migrate
    // const migrate = lib.adbm(db, { collection: mockInfoCollection, directory: 'test/mock' })

    before(() => {
      migrate = lib.adbm({ db, adapter, metadata: mockInfoCollection, directory: 'test/mock' })
    })
    after(async () => {
      await db.collection(mockInfoCollection).drop()
      await db.collection(collection).drop()
    })

    it('runs migrations in order when migrating up', async function () {
      const first = sinon.spy()
      const second = sinon.spy()
      const down = sinon.spy()

      const migrations = [
        {
          id: 'one',
          up: first,
          down
        },
        {
          id: 'two',
          up: second,
          down
        }
      ]

      await lib.performMigrations({ db, migrations, direction: 'up', metadata: mockInfoCollection, registerSuccess: noop })

      sinon.assert.callCount(down, 0)
      sinon.assert.callOrder(first, second)
    })

    it('runs migrations in reverse order when migrating down', async function () {
      const up = sinon.spy()
      const first = sinon.spy()
      const second = sinon.spy()

      const migrations = [
        {
          id: 'one',
          up,
          down: first
        },
        {
          id: 'two',
          up,
          down: second
        }
      ]

      await lib.performMigrations({ db, migrations, direction: 'down', metadata: mockInfoCollection, registerSuccess: noop })

      sinon.assert.callCount(up, 0)
      sinon.assert.callOrder(second, first)
    })

    it('applies pending migrations', async function () {
      await migrate({ exclude: [ '03-ok' ] })

      const first = await db.collection(collection).find().toArray()
      expect(first.length).to.equal(2)

      await migrate()
      const second = await db.collection(collection).find().toArray()
      expect(second.length).to.equal(3)
    })

    it('reverts applied migrations', async function () {
      const direction = 'down'

      await migrate({ direction, exclude: [ '03-ok' ] })

      const first = await db.collection(collection).find().toArray()
      expect(first.length).to.equal(1)

      await migrate({ direction })
      const second = await db.collection(collection).find().toArray()
      expect(second.length).to.equal(0)
    })
  })
})
