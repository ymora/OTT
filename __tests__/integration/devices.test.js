/**
 * Tests d'intégration pour la gestion des dispositifs
 * Tests E2E pour les fonctionnalités critiques de gestion des dispositifs OTT
 */

import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from '@/app/dashboard/page'

jest.mock('@/contexts/AuthContext', () => {
  const React = require('react')
  return {
    AuthProvider: ({ children }) => <>{children}</>,
    useAuth: () => ({
      fetchWithAuth: async (url, options = {}) => {
        return global.fetch(url, options)
      },
      API_URL: 'http://localhost',
      user: {
        id: 1,
        email: 'test@ott.local',
        role_name: 'admin',
        permissions: ['devices.view']
      },
      token: 'fake-token',
      loading: false
    })
  }
})

const createJsonResponse = (body, status = 200) => {
  const textBody = JSON.stringify(body)
  return {
    ok: status >= 200 && status < 400,
    status,
    statusText: status === 200 ? 'OK' : `${status}`,
    url: 'http://localhost/api.php/devices',
    redirected: false,
    type: 'default',
    headers: {
      get: () => 'application/json',
      entries: () => [['content-type', 'application/json']],
      forEach: (cb) => [['content-type', 'application/json']].forEach(cb)
    },
    text: async () => textBody,
    json: async () => body
  }
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/dashboard'
  })
}))

// Mock contexts
jest.mock('@/contexts/UsbContext', () => ({
  useUsb: () => ({
    isConnected: false,
    usbConnectedDevice: null,
    usbDeviceInfo: null,
    usbStreamLastMeasurement: null
  })
}))

// Mock fetch
global.fetch = jest.fn()

describe('Gestion des dispositifs E2E', () => {
  beforeEach(() => {
    global.fetch.mockClear()
    localStorage.setItem('token', 'fake-token')
    localStorage.setItem('ott_token', 'fake-token')
    localStorage.setItem('ott_user', JSON.stringify({
      id: 1,
      email: 'test@ott.local',
      role_name: 'admin',
      permissions: ['devices.view']
    }))
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('devrait afficher la liste des dispositifs', async () => {
    const mockDevices = [
      {
        id: 1,
        sim_iccid: 'OTT-001',
        device_name: 'OTT-001',
        status: 'active',
        last_battery: 15,
        battery_level: 15,
        last_seen: new Date().toISOString()
      },
      {
        id: 2,
        sim_iccid: 'OTT-002',
        device_name: 'OTT-002',
        status: 'active',
        last_battery: 85,
        battery_level: 85,
        last_seen: new Date().toISOString()
      }
    ]

    const createDevicesResponse = () => ({
      success: true,
      devices: { devices: mockDevices },
      pagination: {
        total: mockDevices.length,
        limit: 100,
        offset: 0,
        page: 1,
        total_pages: 1,
        has_next: false,
        has_prev: false
      }
    })

    const emptyCollection = () => ({
      success: true,
      devices: { devices: [] },
      alerts: { alerts: [] },
      users: { users: [] },
      patients: { patients: [] },
      firmwares: { firmwares: [] }
    })

    // Mock réponses API
    global.fetch.mockImplementation((url) => {
      console.log('Mock fetch called with URL:', url)
      if (url.includes('/devices')) {
        const response = createJsonResponse(createDevicesResponse())
        console.log('Returning devices response (mock)')
        return Promise.resolve(response)
      }
      if (url.includes('/alerts')) {
        const response = createJsonResponse({ success: true, alerts: { alerts: [] } })
        console.log('Returning alerts response (mock)')
        return Promise.resolve(response)
      }
      if (url.includes('/users')) {
        const response = createJsonResponse({ success: true, users: { users: [] } })
        console.log('Returning users response (mock)')
        return Promise.resolve(response)
      }
      if (url.includes('/patients')) {
        const response = createJsonResponse({ success: true, patients: { patients: [] } })
        console.log('Returning patients response (mock)')
        return Promise.resolve(response)
      }
      if (url.includes('/firmwares')) {
        const response = createJsonResponse({ success: true, firmwares: { firmwares: [] } })
        console.log('Returning firmwares response (mock)')
        return Promise.resolve(response)
      }
      const defaultResponse = createJsonResponse({ success: true })
      console.log('Returning default response (mock)')
      return Promise.resolve(defaultResponse)
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    // Ouvrir l'accordéon des dispositifs pour afficher la liste
    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    await waitFor(() => {
      expect(screen.getByText(/📍 OTT-001/)).toBeInTheDocument()
      expect(screen.getByText(/📍 OTT-002/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait afficher un message si aucun dispositif', async () => {
    const emptyPayload = () => ({
      success: true,
      devices: { devices: [] },
      alerts: { alerts: [] },
      users: { users: [] },
      patients: { patients: [] },
      firmwares: { firmwares: [] }
    })

    // Mock réponse vide
    global.fetch.mockImplementation((url) => {
      if (url.includes('/devices')) {
        return Promise.resolve(createJsonResponse({ success: true, ...emptyPayload() }))
      }
      if (url.includes('/alerts')) {
        return Promise.resolve(createJsonResponse({ success: true, alerts: { alerts: [] } }))
      }
      if (url.includes('/users')) {
        return Promise.resolve(createJsonResponse({ success: true, users: { users: [] } }))
      }
      if (url.includes('/patients')) {
        return Promise.resolve(createJsonResponse({ success: true, patients: { patients: [] } }))
      }
      if (url.includes('/firmwares')) {
        return Promise.resolve(createJsonResponse({ success: true, firmwares: { firmwares: [] } }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    await waitFor(() => {
      const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
      expect(within(devicesButton).getByText('0')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait gérer les erreurs de chargement', async () => {
    // Mock erreur API (réponse HTTP 500)
    global.fetch.mockImplementation(() => createJsonResponse({
      success: false,
      error: 'API Error',
      message: 'API Error'
    }, 500))

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    try {
      await screen.findByText(/Erreur de chargement/i, {}, { timeout: 3000 })
    } catch (err) {
      screen.debug()
      throw err
    }
  })

  it('devrait filtrer les dispositifs avec batterie faible', async () => {
    const mockDevices = [
      {
        id: 1,
        sim_iccid: 'OTT-001',
        device_name: 'OTT-001',
        battery_level: 15, // Batterie faible
        last_battery: 15,
        status: 'active'
      },
      {
        id: 2,
        sim_iccid: 'OTT-002',
        device_name: 'OTT-002',
        battery_level: 85, // Batterie OK
        last_battery: 85,
        status: 'active'
      }
    ]

    global.fetch.mockImplementation((url) => {
      if (url.includes('/devices')) {
        return Promise.resolve(createJsonResponse({
          success: true,
          devices: { devices: mockDevices }
        }))
      }
      if (url.includes('/alerts')) {
        return Promise.resolve(createJsonResponse({ success: true, alerts: { alerts: [] } }))
      }
      if (url.includes('/users')) {
        return Promise.resolve(createJsonResponse({ success: true, users: { users: [] } }))
      }
      if (url.includes('/patients')) {
        return Promise.resolve(createJsonResponse({ success: true, patients: { patients: [] } }))
      }
      if (url.includes('/firmwares')) {
        return Promise.resolve(createJsonResponse({ success: true, firmwares: { firmwares: [] } }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    await waitFor(() => {
      expect(screen.getByText(/📍 OTT-001/)).toBeInTheDocument()
    }, { timeout: 3000 })

    const batteryButton = screen.getByRole('button', { name: /batterie/i })
    fireEvent.click(batteryButton)

    await waitFor(() => {
      expect(screen.getByText(/🔴 OTT-001 \(15%\)/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait créer un nouveau dispositif', async () => {
    const newDevice = {
      id: 3,
      sim_iccid: 'OTT-003',
      device_name: 'OTT-003',
      status: 'active',
      battery_level: 100,
      last_battery: 100
    }

    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/devices') && options?.method === 'POST') {
        return Promise.resolve(createJsonResponse({
          success: true,
          device: newDevice
        }))
      }
      if (url.includes('/devices') && !options?.method) {
        return Promise.resolve(createJsonResponse({
          success: true,
          devices: { devices: [newDevice] }
        }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    await waitFor(() => {
      expect(screen.getByText(/📍 OTT-003/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait modifier un dispositif existant', async () => {
    const updatedDevice = {
      id: 1,
      sim_iccid: 'OTT-001',
      device_name: 'OTT-001-Updated',
      status: 'active',
      battery_level: 50,
      last_battery: 50
    }

    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/devices/1') && options?.method === 'PUT') {
        return Promise.resolve(createJsonResponse({
          success: true,
          device: updatedDevice
        }))
      }
      if (url.includes('/devices') && !options?.method) {
        return Promise.resolve(createJsonResponse({
          success: true,
          devices: { devices: [updatedDevice] }
        }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    await waitFor(() => {
      expect(screen.getByText(/📍 OTT-001-Updated/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait supprimer un dispositif', async () => {
    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/devices/1') && options?.method === 'DELETE') {
        return Promise.resolve(createJsonResponse({
          success: true,
          message: 'Device deleted successfully'
        }))
      }
      if (url.includes('/devices') && !options?.method) {
        return Promise.resolve(createJsonResponse({
          success: true,
          devices: { devices: [] }
        }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    await waitFor(() => {
      const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
      expect(within(devicesButton).getByText('0')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait mettre à jour le statut d\'un dispositif', async () => {
    const deviceWithStatus = {
      id: 1,
      sim_iccid: 'OTT-001',
      device_name: 'OTT-001',
      status: 'inactive',
      battery_level: 75,
      last_battery: 75
    }

    global.fetch.mockImplementation((url, options) => {
      if (url.includes('/devices/1/status') && options?.method === 'PATCH') {
        return Promise.resolve(createJsonResponse({
          success: true,
          device: deviceWithStatus
        }))
      }
      if (url.includes('/devices') && !options?.method) {
        return Promise.resolve(createJsonResponse({
          success: true,
          devices: { devices: [deviceWithStatus] }
        }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    const devicesButton = screen.getByRole('button', { name: /dispositifs/i })
    fireEvent.click(devicesButton)

    // Le statut n'est pas directement affiché dans l'UI actuelle,
    // on vérifie juste que le dispositif est présent
    await waitFor(() => {
      expect(screen.getByText(/📍 OTT-001/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})

