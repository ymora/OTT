/**
 * Tests d'intégration pour la gestion des dispositifs
 * Tests E2E pour les fonctionnalités critiques de gestion des dispositifs OTT
 */

import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from '@/contexts/AuthContext'
import DashboardPage from '@/app/dashboard/page'

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
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('devrait afficher la liste des dispositifs', async () => {
    const mockDevices = [
      {
        id: 1,
        serial_number: 'OTT-001',
        status: 'active',
        battery_level: 85,
        last_seen: new Date().toISOString()
      },
      {
        id: 2,
        serial_number: 'OTT-002',
        status: 'active',
        battery_level: 60,
        last_seen: new Date().toISOString()
      }
    ]

    // Mock réponses API
    global.fetch.mockImplementation((url) => {
      if (url.includes('/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, devices: mockDevices })
        })
      }
      if (url.includes('/alerts')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, alerts: [] })
        })
      }
      if (url.includes('/users')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, users: [] })
        })
      }
      if (url.includes('/patients')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, patients: [] })
        })
      }
      if (url.includes('/firmwares')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, firmwares: [] })
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true })
      })
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    // Vérifier que les dispositifs sont chargés et affichés
    await waitFor(() => {
      expect(screen.getByText('OTT-001')).toBeInTheDocument()
      expect(screen.getByText('OTT-002')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait afficher un message si aucun dispositif', async () => {
    // Mock réponse vide
    global.fetch.mockImplementation((url) => {
      return Promise.resolve({
        ok: true,
        json: async () => ({ 
          success: true, 
          devices: [],
          alerts: [],
          users: [],
          patients: [],
          firmwares: []
        })
      })
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/aucun dispositif/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait gérer les erreurs de chargement', async () => {
    // Mock erreur API
    global.fetch.mockRejectedValue(new Error('API Error'))

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/erreur/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('devrait filtrer les dispositifs avec batterie faible', async () => {
    const mockDevices = [
      {
        id: 1,
        serial_number: 'OTT-001',
        battery_level: 15, // Batterie faible
        status: 'active'
      },
      {
        id: 2,
        serial_number: 'OTT-002',
        battery_level: 85, // Batterie OK
        status: 'active'
      }
    ]

    global.fetch.mockImplementation((url) => {
      if (url.includes('/devices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, devices: mockDevices })
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, alerts: [], users: [], patients: [], firmwares: [] })
      })
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    // Vérifier que les KPI affichent 1 dispositif avec batterie faible
    await waitFor(() => {
      // Chercher l'indicateur de batterie faible
      const lowBatteryIndicators = screen.getAllByText(/15%/i)
      expect(lowBatteryIndicators.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })
})

