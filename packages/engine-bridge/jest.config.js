const path = require('path');

const projectRoot = path.resolve(__dirname, '../..');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: {
          rootDir: projectRoot,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          module: 'commonjs',
          target: 'ES2022',
          declaration: false,
        },
      },
    ],
  },
};
