/** @type {import('jest').Config} */
module.exports = {
  // components need a DOM to render into, which node alone does not provide
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // jest cannot parse css, and the tests do not care about it either way
    '\\.css$': '<rootDir>/src/test/styleMock.cjs',
  },
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
  // comfortably longer than the 5s asyncUtilTimeout in jest.setup.ts. at the
  // same value, a query that finds nothing trips this first and the failure
  // reads "exceeded timeout" instead of naming the element it looked for
  testTimeout: 15000,
  // one worker per core leaves the suites fighting over the cpu, and a screen
  // waiting on a debounce loses that fight and trips asyncUtilTimeout. the
  // failures move between files from one run to the next, which is what makes
  // them look like real bugs. half the cores is both reliable and quicker.
  maxWorkers: '50%',
};
