import { AdbmAdapter, EnrichedMigrationObject, Logger } from '../../interfaces'

export const mockLogger = (): Logger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
})

export const mockDb = () => jest.fn()

export const mockAdapter = (completed: string[] = []): AdbmAdapter => ({
  init: jest.fn(),
  getCompletedMigrationIds: jest.fn().mockResolvedValue(completed),
  registerMigration: jest.fn(),
  unregisterMigration: jest.fn(),
})

export const mockMigration = (id: string): EnrichedMigrationObject => ({
  id,
  up: jest.fn(),
  down: jest.fn(),
})
