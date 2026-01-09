const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const ADMIN_TOKEN = 'mock-admin-token'
const USER_TOKEN = 'mock-user-token'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
}

const ensureResetMockRoutes = () => {
  if (typeof globalThis.resetMockRoutes !== 'function') {
    throw new Error('resetMockRoutes is not available. Did jest.setup.js run correctly?')
  }
  return globalThis.resetMockRoutes
}

const ensureRegisterMockRoute = () => {
  if (typeof globalThis.registerMockRoute !== 'function') {
    throw new Error('registerMockRoute is not available. Did jest.setup.js run correctly?')
  }
  return globalThis.registerMockRoute
}

const ensureCreateMockResponse = () => {
  if (typeof globalThis.createMockResponse !== 'function') {
    throw new Error('createMockResponse is not available. Did jest.setup.js run correctly?')
  }
  return globalThis.createMockResponse
}

const parseRequestBody = (options = {}) => {
  if (!options.body) return {}
  if (typeof options.body === 'string') {
    try {
      return JSON.parse(options.body)
    } catch {
      return {}
    }
  }
  return options.body
}

const getAuthTokenFromOptions = (options = {}) => {
  const headers = options.headers || {}
  const rawAuth = headers.Authorization || headers.authorization || ''
  if (!rawAuth) return null
  return rawAuth.replace(/^Bearer\s+/i, '')
}

const createUnauthorizedResponse = () =>
  ensureCreateMockResponse()({
    status: 401,
    body: { success: false, error: 'Unauthorized' },
    headers: corsHeaders,
  })

const createForbiddenResponse = () =>
  ensureCreateMockResponse()({
    status: 403,
    body: { success: false, error: 'Forbidden' },
    headers: corsHeaders,
  })

const requireAuth = (options = {}) => {
  if (!getAuthTokenFromOptions(options)) {
    return createUnauthorizedResponse()
  }
  return null
}

const requireAdmin = (options = {}) => {
  const token = getAuthTokenFromOptions(options)
  if (!token) {
    return createUnauthorizedResponse()
  }

  if (token === USER_TOKEN) {
    return createForbiddenResponse()
  }

  if (token !== ADMIN_TOKEN) {
    return createUnauthorizedResponse()
  }

  return null
}

const registerLoginRoute = () => {
  const register = ensureRegisterMockRoute()
  const createMockResponse = ensureCreateMockResponse()

  register({
    path: '/api.php/auth/login',
    method: 'POST',
    response: (_, __, options) => {
      const payload = parseRequestBody(options)
      const isAdmin = payload.email === 'admin@test.com'
      const token = isAdmin ? ADMIN_TOKEN : USER_TOKEN
      return createMockResponse({
        body: {
          success: true,
          token,
          user: {
            email: payload.email ?? 'unknown',
            role: isAdmin ? 'admin' : 'user',
          },
        },
      })
    },
  })
}

const setupAuthMocks = () => {
  const reset = ensureResetMockRoutes()
  reset()
  registerLoginRoute()
}

const setupSecurityMocks = () => {
  const reset = ensureResetMockRoutes()
  reset()
  registerLoginRoute()

  const register = ensureRegisterMockRoute()
  const createMockResponse = ensureCreateMockResponse()
  const invalidEmails = new Set([
    'not-an-email',
    '@domain.com',
    'user@',
    'user..name@domain.com',
  ])

  let healthCallCount = 0

  register({
    path: '/api.php/devices',
    method: 'POST',
    response: (_, __, options) => {
      const authGuard = requireAuth(options)
      if (authGuard) return authGuard
      return createMockResponse({
        status: 500,
        body: { success: false, error: 'Injection détectée' },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/patients',
    method: 'POST',
    response: (_, __, options) => {
      const authGuard = requireAuth(options)
      if (authGuard) return authGuard
      const body = parseRequestBody(options)
      return createMockResponse({
        body: { success: true, patient: { first_name: body.first_name } },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/users',
    method: 'POST',
    response: (_, __, options) => {
      const authGuard = requireAuth(options)
      if (authGuard) return authGuard

      const body = parseRequestBody(options)
      if (invalidEmails.has(body.email)) {
        return createMockResponse({
          status: 400,
          body: { success: false, error: 'Email invalide' },
          headers: corsHeaders,
        })
      }

      return createMockResponse({
        body: {
          success: true,
          user: {
            email: body.email,
            role: body.role_name || 'user',
          },
        },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/users',
    method: 'GET',
    response: (_, __, options) => {
      const token = getAuthTokenFromOptions(options)
      if (!token || token !== ADMIN_TOKEN) {
        return createMockResponse({
          status: 401,
          body: { success: false, error: 'Unauthorized' },
          headers: corsHeaders,
        })
      }
      return createMockResponse({
        body: { success: true },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/admin/migrations',
    method: 'GET',
    response: (_, __, options) => {
      const token = getAuthTokenFromOptions(options)
      if (!token) {
        return createMockResponse({
          status: 401,
          body: { success: false, error: 'Unauthorized' },
          headers: corsHeaders,
        })
      }
      if (token === USER_TOKEN) {
        return createMockResponse({
          status: 403,
          body: { success: false, error: 'Forbidden' },
          headers: corsHeaders,
        })
      }
      return createMockResponse({
        body: { success: true },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/health',
    method: 'GET',
    response: () => {
      healthCallCount += 1
      const status = healthCallCount >= 5 ? 429 : 200
      return createMockResponse({
        status,
        body: { success: status === 200 },
        headers: corsHeaders,
      })
    },
  })

  register({
    path: '/api.php/health',
    method: 'OPTIONS',
    response: () =>
      createMockResponse({
        status: 200,
        headers: corsHeaders,
      }),
  })
}

export {
  API_URL,
  ADMIN_TOKEN,
  USER_TOKEN,
  corsHeaders,
  parseRequestBody,
  getAuthTokenFromOptions,
  requireAuth,
  requireAdmin,
  registerLoginRoute,
  setupAuthMocks,
  setupSecurityMocks,
}
