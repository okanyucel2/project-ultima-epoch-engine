const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/integration/'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@epoch/shared/(.*)$': path.resolve(projectRoot, 'shared/types/$1'),
    '^@epoch/shared$': path.resolve(projectRoot, 'shared/types/index'),
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Disable type-checking in Jest; use `tsc --noEmit` for that.
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
