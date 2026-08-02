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
};
