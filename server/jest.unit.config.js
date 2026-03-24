/** Jest config for unit tests that don't need a database */
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['**/tests/**/*.test.js'],
  maxWorkers: 1,
  testTimeout: 10000,
  forceExit: true,
};
