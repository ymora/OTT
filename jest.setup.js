// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

const createNextRouterMock = () => {
  const push = jest.fn()
  const replace = jest.fn()
  const prefetch = jest.fn(() => Promise.resolve())
  const refresh = jest.fn()
  const back = jest.fn()
  const forward = jest.fn()
  return {
    push,
    replace,
    prefetch,
    refresh,
    back,
    forward,
    pathname: '/',
    query: {},
    params: {},
    searchParams: new URLSearchParams(),
    segments: [],
  }
}

const nextRouter = createNextRouterMock()

jest.mock('next/navigation', () => {
  const AppRouterContext = {
    Provider: ({ children }) => children,
  }

  return {
    useRouter: () => nextRouter,
    usePathname: () => nextRouter.pathname,
    useSearchParams: () => nextRouter.searchParams,
    useParams: () => nextRouter.params,
    useSelectedLayoutSegments: () => nextRouter.segments,
    AppRouterContext,
  }
})

// Helper pour construire des réponses mockées
const createMockResponse = ({ status = 200, body = {}, headers = {} } = {}) => {
  const normalizedStatus = Number.isFinite(status) ? status : 200
  const resultBody = typeof body === 'function' ? body() : body
  const lowerHeaders = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

  return {
    ok: normalizedStatus >= 200 && normalizedStatus < 400,
    status: normalizedStatus,
    headers: {
      get(name) {
        const normalized = name?.toLowerCase()
        if (normalized === 'content-type') {
          return lowerHeaders['content-type'] || 'application/json'
        }
        return lowerHeaders[normalized] || null
      }
    },
    json: async () => resultBody,
    text: async () => (typeof resultBody === 'string' ? resultBody : JSON.stringify(resultBody)),
  }
}

const mockRoutes = []

const registerMockRoute = ({ path, method = 'GET', matcher, response }) => {
  const normalizedMethod = method.toUpperCase()
  const defaultMatcher = (url) => {
    try {
      const parsed = new URL(url, 'http://localhost')
      const pathname = parsed.pathname
      if (path instanceof RegExp) {
        return path.test(pathname)
      }
      return pathname === path
    } catch {
      return false
    }
  }

  mockRoutes.push({
    matcher: matcher || defaultMatcher,
    method: normalizedMethod,
    response: response || (() => createMockResponse({}))
  })
}

const resetMockRoutes = () => {
  mockRoutes.length = 0
}

const fetchMockImplementation = jest.fn(async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase()
  const route = mockRoutes.find(entry => entry.method === method && entry.matcher(url, method, options))
  if (!route) {
    return createMockResponse({ body: { success: true } })
  }
  return route.response(url, method, options)
})

global.fetch = fetchMockImplementation
global.registerMockRoute = registerMockRoute
global.resetMockRoutes = resetMockRoutes
global.createMockResponse = createMockResponse

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

// Mock localStorage simple (avec stockage réel)
const localStorageStore = {}
const localStorageMock = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(localStorageStore, key) ? localStorageStore[key] : null
  },
  setItem(key, value) {
    localStorageStore[key] = value?.toString() ?? value
  },
  removeItem(key) {
    delete localStorageStore[key]
  },
  clear() {
    Object.keys(localStorageStore).forEach(key => delete localStorageStore[key])
  },
}
global.localStorage = localStorageMock

