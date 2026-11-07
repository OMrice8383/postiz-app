const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.base.json');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/jarvis/**/*.spec.ts', '<rootDir>/tests/jarvis/**/*.spec.tsx'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
      tsconfig: { ...compilerOptions, module: 'commonjs', jsx: 'react-jsx' },
    }],
  },
  clearMocks: true,
};
