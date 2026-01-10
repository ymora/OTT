/**
 * Service centralisé pour toutes les opérations sur les dispositifs
 * Élimine la duplication des appels API dans les composants
 */

export class DeviceService {
  constructor(fetchWithAuth, apiUrl) {
    this.fetchWithAuth = fetchWithAuth
    this.apiUrl = apiUrl
  }

  // GET Operations
  async getAll({ includeArchived = false } = {}) {
    const url = includeArchived 
      ? `${this.apiUrl}/api.php/devices?show_archived=true`
      : `${this.apiUrl}/api.php/devices`
    return await this.fetchWithAuth(url)
  }

  async getById(id, { includeArchived = false } = {}) {
    const url = includeArchived
      ? `${this.apiUrl}/api.php/devices/${id}?show_archived=true`
      : `${this.apiUrl}/api.php/devices/${id}`
    return await this.fetchWithAuth(url)
  }

  async getMeasurements(deviceId, { includeArchived = false } = {}) {
    const url = includeArchived
      ? `${this.apiUrl}/api.php/devices/${deviceId}/measurements?show_archived=true`
      : `${this.apiUrl}/api.php/devices/${deviceId}/measurements`
    return await this.fetchWithAuth(url)
  }

  async getLogs(deviceId, { limit = 100 } = {}) {
    return await this.fetchWithAuth(
      `${this.apiUrl}/api.php/devices/${deviceId}/logs?limit=${limit}`
    )
  }

  // POST Operations
  async create(deviceData) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices`, {
      method: 'POST',
      body: JSON.stringify(deviceData)
    })
  }

  async sendCommand(deviceId, command) {
    return await this.fetchWithAuth(
      `${this.apiUrl}/api.php/devices/${deviceId}/command`,
      {
        method: 'POST',
        body: JSON.stringify({ command })
      }
    )
  }

  // PUT/PATCH Operations
  async update(deviceId, updates) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  }

  async assignPatient(deviceId, patientId) {
    return await this.fetchWithAuth(
      `${this.apiUrl}/api.php/devices/${deviceId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify({ patient_id: patientId })
      }
    )
  }

  async unassignPatient(deviceId) {
    return await this.fetchWithAuth(
      `${this.apiUrl}/api.php/devices/${deviceId}/unassign`,
      {
        method: 'POST'
      }
    )
  }

  // Archive/Restore/Delete
  async archive(deviceId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'archive' })
    })
  }

  async restore(deviceId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restore' })
    })
  }

  async permanentDelete(deviceId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/${deviceId}`, {
      method: 'DELETE'
    })
  }

  // USB specific
  async registerUsbDevice(iccidOrSerial, additionalData = {}) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/usb/register`, {
      method: 'POST',
      body: JSON.stringify({
        iccid_or_serial: iccidOrSerial,
        ...additionalData
      })
    })
  }

  async sendUsbLog(iccidOrSerial, log) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/usb/log`, {
      method: 'POST',
      body: JSON.stringify({
        iccid_or_serial: iccidOrSerial,
        log
      })
    })
  }

  async sendMeasurement(iccidOrSerial, measurement) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/devices/usb/measurement`, {
      method: 'POST',
      body: JSON.stringify({
        iccid_or_serial: iccidOrSerial,
        ...measurement
      })
    })
  }
}

// Instance singleton (peut être remplacée par le pattern Factory si besoin)
let deviceServiceInstance = null

export function getDeviceService(fetchWithAuth, apiUrl) {
  if (!deviceServiceInstance) {
    deviceServiceInstance = new DeviceService(fetchWithAuth, apiUrl)
  }
  return deviceServiceInstance
}

export default DeviceService
