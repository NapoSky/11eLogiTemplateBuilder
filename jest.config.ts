import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts', // Entry point - difficile à tester isolément
    '!src/App.ts', // Entry point - orchestre les composants
    '!src/config.ts', // Mocké pour les tests (import.meta)
    '!src/**/*.d.ts',
    '!src/__tests__/**', // Exclure les fichiers de test eux-mêmes
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    // Seuils par fichier pour la logique métier testable
    './src/store.ts': {
      branches: 65,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/types.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/services/iconLoader.ts': {
      branches: 70,
      functions: 100,
      lines: 85,
      statements: 85,
    },
    // Les composants UI sont exclus des seuils car ils sont testés
    // fonctionnellement mais génèrent peu de coverage Jest (DOM-heavy)
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  moduleNameMapper: {
    // Mock du fichier config.ts qui utilise import.meta
    '^../config$': '<rootDir>/src/__tests__/__mocks__/config.ts',
    '^./config$': '<rootDir>/src/__tests__/__mocks__/config.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Transformer les modules ES qui posent problème
  transformIgnorePatterns: [
    'node_modules/(?!(html2canvas-pro)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  verbose: true,
  // Injecter le mock de import.meta
  globals: {
    'import.meta': {
      env: {
        BASE_URL: '/',
        DEV: true,
        PROD: false,
        MODE: 'test',
      },
    },
  },
};

export default config;
