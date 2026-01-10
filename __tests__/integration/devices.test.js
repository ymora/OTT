/**
 * Tests d'intégration pour la gestion des dispositifs
 */

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react"
import { AuthProvider } from "@/contexts/AuthContext"
import DashboardPage from "@/app/dashboard/page"

jest.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({
    fetchWithAuth: async (url, options = {}) => global.fetch(url, options),
    API_URL: "http://localhost",
    user: { 
      id: 1, 
      email: "test@ott.local", 
      role_name: "admin", 
      permissions: ["devices.view"] 
    },
    token: "fake-token",
    loading: false
  })
}))

const createJsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 400,
  status,
  statusText: status === 200 ? "OK" : `${status}`,
  url: "http://localhost/api.php/devices",
  redirected: false,
  type: "default",
  headers: {
    get: () => "application/json",
    entries: () => [["content-type", "application/json"]],
    forEach: (cb) => [["content-type", "application/json"]].forEach(cb)
  },
  text: async () => JSON.stringify(body),
  json: async () => body
})

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), pathname: "/dashboard" })
}))

jest.mock("@/contexts/UsbContext", () => ({
  useUsb: () => ({
    isConnected: false,
    usbConnectedDevice: null,
    usbDeviceInfo: null,
    usbStreamLastMeasurement: null
  })
}))

global.fetch = jest.fn()

describe("Gestion des dispositifs E2E", () => {
  beforeEach(() => {
    global.fetch.mockClear()
    localStorage.setItem("token", "fake-token")
    localStorage.setItem("ott_token", "fake-token")
    localStorage.setItem("ott_user", JSON.stringify({
      id: 1,
      email: "test@ott.local",
      role_name: "admin",
      permissions: ["devices.view"]
    }))
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("devrait afficher la liste des dispositifs", async () => {
    const mockDevices = [
      { 
        id: 1, 
        sim_iccid: "OTT-001", 
        device_name: "OTT-001", 
        status: "active", 
        last_battery: 15, 
        last_seen: new Date().toISOString() 
      },
      { 
        id: 2, 
        sim_iccid: "OTT-002", 
        device_name: "OTT-002", 
        status: "active", 
        last_battery: 85, 
        last_seen: new Date().toISOString() 
      }
    ]

    global.fetch.mockImplementation((url) => {
      if (url.includes("/devices")) {
        return Promise.resolve(createJsonResponse({ 
          success: true, 
          devices: { devices: mockDevices } 
        }))
      }
      return Promise.resolve(createJsonResponse({ success: true }))
    })

    render(
      <AuthProvider>
        <DashboardPage />
      </AuthProvider>
    )

    await waitFor(() => {
      const devicesButton = screen.getByRole("button", { name: /dispositifs/i })
      expect(within(devicesButton).getByText("2")).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it("devrait afficher le tableau de bord", async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes("/devices")) {
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

    await waitFor(() => {
      expect(screen.getByText(/Vue d.Ensemble/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})