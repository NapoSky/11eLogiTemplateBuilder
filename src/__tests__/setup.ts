// Setup file pour Jest - Mock des globals et APIs du navigateur

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock import.meta.env pour Vite - doit être défini AVANT les imports
// @ts-expect-error - Mock de import.meta pour les tests
globalThis.importMetaEnv = {
  BASE_URL: '/',
  DEV: true,
  PROD: false,
  MODE: 'test',
};

// Reset tous les mocks avant chaque test
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
});

// Supprime les console.error/warn parasites dans les tests
// (sauf si on veut les capturer)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Export pour utilisation dans les tests
export { localStorageMock };
