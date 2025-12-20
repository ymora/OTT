/**
 * Service centralisé pour toutes les opérations sur les patients
 * Élimine la duplication des appels API dans les composants
 */

export class PatientService {
  constructor(fetchWithAuth, apiUrl) {
    this.fetchWithAuth = fetchWithAuth
    this.apiUrl = apiUrl
  }

  // GET Operations
  async getAll({ includeArchived = false } = {}) {
    const url = includeArchived
      ? `${this.apiUrl}/api.php/patients?show_archived=true`
      : `${this.apiUrl}/api.php/patients`
    return await this.fetchWithAuth(url)
  }

  async getById(id, { includeArchived = false } = {}) {
    const url = includeArchived
      ? `${this.apiUrl}/api.php/patients/${id}?show_archived=true`
      : `${this.apiUrl}/api.php/patients/${id}`
    return await this.fetchWithAuth(url)
  }

  async getDevices(patientId) {
    return await this.fetchWithAuth(
      `${this.apiUrl}/api.php/patients/${patientId}/devices`
    )
  }

  async getMeasurements(patientId, { includeArchived = false } = {}) {
    const url = includeArchived
      ? `${this.apiUrl}/api.php/patients/${patientId}/measurements?show_archived=true`
      : `${this.apiUrl}/api.php/patients/${patientId}/measurements`
    return await this.fetchWithAuth(url)
  }

  // POST Operations
  async create(patientData) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/patients`, {
      method: 'POST',
      body: JSON.stringify(patientData)
    })
  }

  // PUT Operations
  async update(patientId, updates) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/patients/${patientId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  }

  // Archive/Restore/Delete
  async archive(patientId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/patients/${patientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'archive' })
    })
  }

  async restore(patientId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/patients/${patientId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'restore' })
    })
  }

  async permanentDelete(patientId) {
    return await this.fetchWithAuth(`${this.apiUrl}/api.php/patients/${patientId}`, {
      method: 'DELETE'
    })
  }
}

// Instance singleton
let patientServiceInstance = null

export function getPatientService(fetchWithAuth, apiUrl) {
  if (!patientServiceInstance) {
    patientServiceInstance = new PatientService(fetchWithAuth, apiUrl)
  }
  return patientServiceInstance
}

export default PatientService

