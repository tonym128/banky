module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '^https://esm\.sh/(.*)$': '<rootDir>/__mocks__/esmSh.js',
    '\.(css|less)$': '<rootDir>/__mocks__/styleMock.js'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true
};
