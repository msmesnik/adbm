import { mockAdapter, mockDb, mockLogger, mockMigration } from './helpers'
import { AdbmAdapter, MigrationObject } from '../interfaces'
import {
  adbm,
  DOWN,
  getMigrationObjectsFromDirectory,
  isValidMigrationObject,
  performMigrations,
  UP,
  validateAdapter,
} from '../index'

describe('migrations', function () {
  const mockInfoCollection = '_mocha_mock_migrations'
  const noop = jest.fn()

  describe('general functionality', function () {
    it('requires a database driver and adapter object', async function () {
      // @ts-ignore
      expect(() => adbm()).toThrow()
      // @ts-ignore
      expect(() => adbm(mockDb())).toThrow()
      expect(() => adbm(mockDb(), mockAdapter())).not.toThrow()
    })

    it('validates an adapter object', function () {
      expect(() => validateAdapter({} as AdbmAdapter)).toThrow()
      expect(() =>
        validateAdapter(({ init: noop } as unknown) as AdbmAdapter),
      ).toThrow()
      expect(() =>
        validateAdapter(({
          init: noop,
          getCompletedMigrationIds: noop,
        } as unknown) as AdbmAdapter),
      ).toThrow()
      expect(() =>
        validateAdapter(({
          init: noop,
          getCompletedMigrationIds: noop,
          registerMigration: noop,
        } as unknown) as AdbmAdapter),
      ).toThrow()
      expect(() =>
        validateAdapter({
          init: noop,
          getCompletedMigrationIds: noop,
          registerMigration: noop,
          unregisterMigration: noop,
        }),
      ).not.toThrow()
    })

    it('validates the provided adapter and returns a function', () => {
      const adapter = mockAdapter()
      const validateAdapter = jest.fn()

      const migrate = adbm(mockDb(), adapter, { validateAdapter })

      expect(validateAdapter).toHaveBeenCalledWith(adapter)
      expect(migrate).toEqual(expect.any(Function))
    })

    it('requires migration objects to have "up" and "down" functions', function () {
      const up = noop
      const down = noop

      // @ts-ignore
      expect(isValidMigrationObject()).toBe(false)
      // @ts-ignore
      expect(isValidMigrationObject(1)).toBe(false)
      // @ts-ignore
      expect(isValidMigrationObject('a')).toBe(false)
      // @ts-ignore
      expect(isValidMigrationObject(up)).toBe(false)
      expect(isValidMigrationObject({} as MigrationObject)).toBe(false)
      expect(
        isValidMigrationObject(({ up } as unknown) as MigrationObject),
      ).toBe(false)
      expect(
        isValidMigrationObject(({ down } as unknown) as MigrationObject),
      ).toBe(false)
      expect(isValidMigrationObject({ up, down })).toBe(true)
    })

    it('reads migration files fron a directory', async function () {
      const migrations = await getMigrationObjectsFromDirectory({
        directory: __dirname + '/mock',
        exclude: ['04-ok'],
        logger: mockLogger(),
      })

      expect(migrations.map(m => m.id)).toEqual(['01-ok', '03-ok'])
    })
  })

  describe('running migrations', function () {
    it('runs migrations in order when migrating up', async function () {
      const calls = []

      const db = mockDb()
      const logger = mockLogger()
      const first = jest.fn().mockImplementation(() => {
        calls.push('first')
      })
      const second = jest.fn().mockImplementation(() => {
        calls.push('second')
      })
      const down = jest.fn()

      const migrations = [
        {
          id: 'one',
          up: first,
          down,
        },
        {
          id: 'two',
          up: second,
          down,
        },
      ]

      await performMigrations({
        db,
        logger,
        migrations,
        direction: 'up',
        metadata: mockInfoCollection,
        registerSuccess: noop,
      })

      expect(down).toHaveBeenCalledTimes(0)
      expect(first).toHaveBeenCalledWith(db, logger)
      expect(second).toHaveBeenCalledWith(db, logger)

      expect(calls).toEqual(['first', 'second'])
    })

    it('runs migrations in reverse order when migrating down', async function () {
      const calls = []

      const db = mockDb()
      const logger = mockLogger()
      const first = jest.fn().mockImplementation(() => {
        calls.push('first')
      })
      const second = jest.fn().mockImplementation(() => {
        calls.push('second')
      })
      const up = jest.fn()

      const migrations = [
        {
          id: 'one',
          up,
          down: first,
        },
        {
          id: 'two',
          up,
          down: second,
        },
      ]

      await performMigrations({
        db,
        migrations,
        logger,
        direction: 'down',
        metadata: mockInfoCollection,
        registerSuccess: noop,
      })

      expect(up).toHaveBeenCalledTimes(0)
      expect(first).toHaveBeenCalledWith(db, logger)
      expect(second).toHaveBeenCalledWith(db, logger)

      expect(calls).toEqual(['second', 'first'])
    })

    it('applies pending migrations', async function () {
      const db = mockDb()
      const metadata = mockInfoCollection
      const adapter = mockAdapter()
      const logger = mockLogger()
      const migrations = [
        mockMigration('01-first'),
        mockMigration('02-second'),
        mockMigration('04-fourth'),
      ]
      const getMigrationObjects = jest.fn().mockResolvedValueOnce(migrations)
      const runMigrations = jest
        .fn()
        .mockResolvedValue([{ id: '01-first', duration: (0.1).toFixed(3) }])

      const migrate = adbm(db, adapter, {
        metadata,
        getMigrationObjects,
        runMigrations,
        logger,
      })

      const result = await migrate({ exclude: ['03-third'] })

      expect(result).toEqual([{ id: '01-first', duration: (0.1).toFixed(3) }])

      expect(getMigrationObjects).toHaveBeenCalledWith({
        logger,
        exclude: ['03-third'],
      })

      expect(runMigrations).toHaveBeenCalledWith({
        migrations,
        db,
        direction: UP,
        metadata,
        logger,
        registerSuccess: adapter.registerMigration,
      })
    })

    it('reverts applied migrations', async function () {
      const db = mockDb()
      const metadata = mockInfoCollection
      const one = mockMigration('01-first')
      const two = mockMigration('02-second')
      const three = mockMigration('03-third')
      const four = mockMigration('04-fourth')
      const five = mockMigration('05-fifth')
      const completed = [one.id, two.id, three.id, four.id]
      const adapter = mockAdapter(completed)
      const logger = mockLogger()
      const migrations = [one, two, four, five]
      const getMigrationObjects = jest.fn().mockResolvedValueOnce(migrations)
      const runMigrations = jest.fn().mockResolvedValue([])

      const migrate = adbm(db, adapter, {
        metadata,
        getMigrationObjects,
        runMigrations,
        logger,
      })

      await migrate({ direction: DOWN, exclude: [three.id] })

      expect(runMigrations).toHaveBeenCalledWith({
        migrations: [one, two, four],
        db,
        direction: DOWN,
        metadata,
        logger,
        registerSuccess: adapter.unregisterMigration,
      })
    })
  })
})
