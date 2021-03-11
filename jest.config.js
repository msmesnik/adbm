module.exports = {
  moduleFileExtensions: ['ts', 'js'],
  rootDir: 'src',
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
}
