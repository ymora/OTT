// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill fetch pour Jest (jsdom n'a pas fetch natif)
// Node.js 18+ a fetch natif, mais dans l'environnement jsdom de Jest, il n'est pas disponible
// Utiliser fetch natif de Node.js globalement
const { fetch: nodeFetch, Headers: NodeHeaders, Request: NodeRequest, Response: NodeResponse } = globalThis

if (typeof global.fetch === 'undefined') {
  // Utiliser fetch natif de Node.js si disponible
  if (typeof nodeFetch !== 'undefined') {
    global.fetch = nodeFetch
    global.Headers = NodeHeaders
    global.Request = NodeRequest
    global.Response = NodeResponse
  } else {
    // Fallback: utiliser node-fetch si disponible via dépendance transitive
    try {
      // node-fetch est disponible via @sentry/cli
      const nodeFetchModule = require('node-fetch')
      global.fetch = nodeFetchModule.default || nodeFetchModule
      global.Headers = nodeFetchModule.Headers || global.Headers
      global.Request = nodeFetchModule.Request || global.Request
      global.Response = nodeFetchModule.Response || global.Response
    } catch (e) {
      // Dernier recours: mock basique
      global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      }))
    }
  }
}

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

