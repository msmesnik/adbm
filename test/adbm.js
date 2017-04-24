/* eslint-env mocha */

const { expect } = require('chai')
const adapter = require('adbm-mongodb')

const { getConnection } = require('./helpers')
const lib = require('../lib')

describe('migrations', function () {
  let db
  const mockInfoCollection = '_mocha_mock_migrations'
  const getIds = (items) => items.map(({ id }) => id)

  before(async () => {
    db = await getConnection()
  })

  describe('general functionality', function () {
    it('requires a mongodb driver object', async function () {
      expect(() => lib.adbm()).to.throw()
      expect(() => lib.adbm(db)).to.not.throw()
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

      const ops = await lib.performMigrations({ db, migrations, direction: 'up', metadata: mockInfoCollection, registerSuccess: noop })

      expect(ops).to.be.an('array')
      expect(ops.length).to.equal(2)

      expect(first).to.equal(1)
      expect(second).to.equal(2)
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
