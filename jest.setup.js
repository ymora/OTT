// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock Web Serial API
global.navigator = {
  ...global.navigator,
  serial: {
    getPorts: jest.fn(() => Promise.resolve([])),
    requestPort: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
}

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

