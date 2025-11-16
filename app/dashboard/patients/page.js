'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import Chart from '@/components/Chart'
import { useRouter } from 'next/navigation'

export default function PatientsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const router = useRouter()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const emptyForm = useMemo(() => ({
    first_name: '',
    last_name: '',
    birth_date: '',
    phone: '',
    email: '',
    city: '',
    postal_code: ''
  }), [])
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingPatient, setEditingPatient] = useState(null)
  const [deletingPatient, setDeletingPatient] = useState(null)
  const [patientDetails, setPatientDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [patientNotifPrefs, setPatientNotifPrefs] = useState({
    email_enabled: true,
    sms_enabled: false,
    push_enabled: false,
    notify_battery_low: true,
    notify_device_offline: true,
    notify_abnormal_flow: true,
    notify_alert_critical: true
  })
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false)

  const loadPatients = useCallback(async () => {
    try {
      setError(null)
      setSuccess(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/patients')
      setPatients(data.patients || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (searchTerm) {
        const needle = searchTerm.toLowerCase()
        const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''} ${p.phone || ''} ${p.device_name || ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [patients, searchTerm])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Effacer l'erreur du champ quand l'utilisateur modifie
    if (formErrors[field]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validateForm = () => {
    const errors = {}
    
    // Prénom obligatoire
    if (!formData.first_name || formData.first_name.trim().length === 0) {
      errors.first_name = 'Le prénom est obligatoire'
    } else if (formData.first_name.trim().length < 2) {
      errors.first_name = 'Le prénom doit contenir au moins 2 caractères'
    }
    
    // Nom obligatoire
    if (!formData.last_name || formData.last_name.trim().length === 0) {
      errors.last_name = 'Le nom est obligatoire'
    } else if (formData.last_name.trim().length < 2) {
      errors.last_name = 'Le nom doit contenir au moins 2 caractères'
    }
    
    // Email (optionnel mais doit être valide si renseigné)
    if (formData.email && formData.email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = 'Format d\'email invalide (ex: nom@example.com)'
      }
    }
    
    // Téléphone (optionnel mais doit être valide si renseigné)
    if (formData.phone && formData.phone.trim().length > 0) {
      const phoneRegex = /^(\+33|0)[1-9](\d{2}){4}$/
      const cleanedPhone = formData.phone.replace(/\s/g, '')
      if (!phoneRegex.test(cleanedPhone)) {
        errors.phone = 'Format de téléphone invalide (ex: +33612345678 ou 0612345678)'
      }
    }
    
    // Code postal (optionnel mais doit être valide si renseigné)
    if (formData.postal_code && formData.postal_code.trim().length > 0) {
      const postalRegex = /^\d{5}$/
      if (!postalRegex.test(formData.postal_code.trim())) {
        errors.postal_code = 'Le code postal doit contenir 5 chiffres'
      }
    }
    
    // Date de naissance (optionnel mais doit être valide si renseigné)
    if (formData.birth_date && formData.birth_date.trim().length > 0) {
      const birthDate = new Date(formData.birth_date)
      const today = new Date()
      if (isNaN(birthDate.getTime())) {
        errors.birth_date = 'Date de naissance invalide'
      } else if (birthDate > today) {
        errors.birth_date = 'La date de naissance ne peut pas être dans le futur'
      } else {
        const age = today.getFullYear() - birthDate.getFullYear()
        if (age > 150) {
          errors.birth_date = 'Date de naissance invalide (âge > 150 ans)'
        }
      }
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreatePatient = async () => {
    setError(null)
    setFormErrors({})
    
    if (!validateForm()) {
      setError('Veuillez corriger les erreurs dans le formulaire')
      return
    }
    
    try {
      setSaving(true)
      setError(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/patients',
        { method: 'POST', body: JSON.stringify(formData) },
        { requiresAuth: true }
      )
      setShowForm(false)
      setFormData(emptyForm)
      setFormErrors({})
      setSuccess('Patient créé avec succès')
      loadPatients()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const savePatientNotifications = async () => {
    if (!selectedPatient) return
    try {
      setSavingNotifPrefs(true)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/patients/${selectedPatient.id}/notifications`,
        { method: 'PUT', body: JSON.stringify(patientNotifPrefs) },
        { requiresAuth: true }
      )
      setSuccess('Préférences de notifications enregistrées')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingNotifPrefs(false)
    }
  }

  const handleEdit = (patient) => {
    setEditingPatient(patient)
    setFormData({
      first_name: patient.first_name || '',
      last_name: patient.last_name || '',
      birth_date: patient.birth_date ? patient.birth_date.split('T')[0] : '',
      phone: patient.phone || '',
      email: patient.email || '',
      city: patient.city || '',
      postal_code: patient.postal_code || ''
    })
    setFormErrors({})
    setShowForm(true)
  }

  const handleUpdatePatient = async () => {
    if (!editingPatient) return
    
    setError(null)
    setFormErrors({})
    
    if (!validateForm()) {
      setError('Veuillez corriger les erreurs dans le formulaire')
      return
    }
    
    try {
      setSaving(true)
      setError(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/patients/${editingPatient.id}`,
        { method: 'PUT', body: JSON.stringify(formData) },
        { requiresAuth: true }
      )
      setShowForm(false)
      setEditingPatient(null)
      setFormData(emptyForm)
      setFormErrors({})
      setSuccess('Patient modifié avec succès')
      loadPatients()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (patient) => {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer le patient "${patient.first_name} ${patient.last_name}" ?\n\nCette action est irréversible.`)) {
      return
    }

    try {
      setDeletingPatient(patient.id)
      setError(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/patients/${patient.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      setSuccess('Patient supprimé avec succès')
      loadPatients()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingPatient(null)
    }
  }

  const handleShowDetails = async (patient) => {
    setSelectedPatient(patient)
    setLoadingDetails(true)
    setPatientDetails(null)
    try {
      const [devicesData, alertsData, measurementsData, notifData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/measurements/latest'),
        fetchJson(fetchWithAuth, API_URL, `/api.php/patients/${patient.id}/notifications`).catch(() => ({ preferences: null }))
      ])
      
      // Charger les préférences de notifications
      if (notifData.preferences) {
        setPatientNotifPrefs(notifData.preferences)
      } else {
        // Valeurs par défaut
        setPatientNotifPrefs({
          email_enabled: !!patient.email,
          sms_enabled: !!patient.phone,
          push_enabled: false,
          notify_battery_low: true,
          notify_device_offline: true,
          notify_abnormal_flow: true,
          notify_alert_critical: true
        })
      }
      
      const patientDevice = (devicesData.devices || []).find(d => 
        d.patient_id === patient.id || (d.first_name === patient.first_name && d.last_name === patient.last_name)
      )
      const patientAlerts = (alertsData.alerts || []).filter(a => 
        patientDevice && a.device_id === patientDevice.id
      )
      const patientMeasurements = (measurementsData.measurements || []).filter(m =>
        patientDevice && m.device_id === patientDevice.id
      ).slice(0, 100)
      
      setPatientDetails({
        device: patientDevice,
        alerts: patientAlerts,
        measurements: patientMeasurements,
        stats: {
          totalMeasurements: patientMeasurements.length,
          avgFlowrate: patientMeasurements.length > 0
            ? (patientMeasurements.reduce((sum, m) => sum + (m.flowrate || 0), 0) / patientMeasurements.length).toFixed(2)
            : 0,
          lastMeasurement: patientMeasurements.length > 0 ? patientMeasurements[0].timestamp : null
        }
      })
    } catch (err) {
      console.error(err)
      setError('Erreur lors du chargement des détails')
    } finally {
      setLoadingDetails(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Patients</h1>
      </div>

      {/* Recherche et Nouveau Patient sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            className="input"
            placeholder="Rechercher un patient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={() => {
          setEditingPatient(null)
          setFormData(emptyForm)
          setFormErrors({})
          setShowForm(true)
        }}>➕ Nouveau Patient</button>
      </div>

      {(error || success) && (
        <div className={`alert ${error ? 'alert-warning' : 'alert-success'}`}>
          {error || success}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="animate-shimmer h-96"></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Date Naissance</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Dispositif</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500">
                      {searchTerm ? 'Aucun patient ne correspond à la recherche' : 'Aucun patient'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((p, i) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50 animate-slide-up" style={{animationDelay: `${i * 0.05}s`}}>
                      <td className="py-3 px-4 font-medium">{p.first_name} {p.last_name}</td>
                      <td className="py-3 px-4">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                      <td className="py-3 px-4">{p.phone || '-'}</td>
                      <td className="py-3 px-4">{p.email || '-'}</td>
                      <td className="py-3 px-4">
                        {p.device_name ? (
                          <div className="space-y-1">
                            <p className="font-medium">{p.device_name}</p>
                            <p className="text-xs text-gray-500 font-mono">{p.sim_iccid}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-amber-600">Non assigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => handleEdit(p)}
                            title="Modifier le patient"
                          >
                            <span className="text-lg">✏️</span>
                          </button>
                          <button
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            onClick={() => handleDelete(p)}
                            disabled={deletingPatient === p.id}
                            title="Supprimer le patient"
                          >
                            <span className="text-lg">{deletingPatient === p.id ? '⏳' : '🗑️'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">{editingPatient ? 'Modifier le patient' : 'Nouveau patient'}</h2>
              <button className="text-gray-500 hover:text-gray-900" onClick={() => {
                setShowForm(false)
                setEditingPatient(null)
                setFormData(emptyForm)
                setFormErrors({})
              }}>✖</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Prénom *</label>
                <input className="input" value={formData.first_name} onChange={e => handleChange('first_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nom *</label>
                <input className="input" value={formData.last_name} onChange={e => handleChange('last_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Date de naissance</label>
                <input type="date" className="input" value={formData.birth_date} onChange={e => handleChange('birth_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Téléphone</label>
                <input className="input" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="+33..." />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email</label>
                <input className="input" type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Ville</label>
                <input className="input" value={formData.city} onChange={e => handleChange('city', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Code postal</label>
                <input className="input" value={formData.postal_code} onChange={e => handleChange('postal_code', e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setShowForm(false)
                  setFormData(emptyForm)
                  setFormErrors({})
                }}
              >
                Annuler
              </button>
              <button 
                className="btn-primary" 
                onClick={editingPatient ? handleUpdatePatient : handleCreatePatient} 
                disabled={saving}
              >
                {saving ? (editingPatient ? 'Modification...' : 'Création...') : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                👤 Détails Patient : {selectedPatient.first_name} {selectedPatient.last_name}
              </h2>
              <button 
                className="text-gray-500 hover:text-gray-900 text-2xl" 
                onClick={() => {
                  setSelectedPatient(null)
                  setPatientDetails(null)
                }}
              >
                ✖
              </button>
            </div>

            <div className="p-6 space-y-6">
              {loadingDetails ? (
                <div className="animate-shimmer h-64"></div>
              ) : patientDetails ? (
                <>
                  {/* Informations patient */}
                  <div className="card">
                    <h3 className="text-lg font-semibold mb-4">📋 Informations</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Prénom</p>
                        <p className="font-medium">{selectedPatient.first_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Nom</p>
                        <p className="font-medium">{selectedPatient.last_name}</p>
                      </div>
                      {selectedPatient.birth_date && (
                        <div>
                          <p className="text-sm text-gray-500">Date de naissance</p>
                          <p className="font-medium">{new Date(selectedPatient.birth_date).toLocaleDateString('fr-FR')}</p>
                        </div>
                      )}
                      {selectedPatient.phone && (
                        <div>
                          <p className="text-sm text-gray-500">Téléphone</p>
                          <p className="font-medium">{selectedPatient.phone}</p>
                        </div>
                      )}
                      {selectedPatient.email && (
                        <div>
                          <p className="text-sm text-gray-500">Email</p>
                          <p className="font-medium">{selectedPatient.email}</p>
                        </div>
                      )}
                      {(selectedPatient.city || selectedPatient.postal_code) && (
                        <div>
                          <p className="text-sm text-gray-500">Adresse</p>
                          <p className="font-medium">
                            {selectedPatient.city || ''} {selectedPatient.postal_code || ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notifications */}
                  <div className="card">
                    <h3 className="text-lg font-semibold mb-4">📧 Notifications</h3>
                    <div className="space-y-4">
                      {/* Canaux de notification */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Canaux activés</label>
                        <div className="grid grid-cols-3 gap-3">
                          <label className={`flex items-center gap-2 p-2 rounded ${selectedPatient.email ? 'bg-gray-50' : 'bg-gray-100 opacity-50'}`}>
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.email_enabled && !!selectedPatient.email}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
                              disabled={!selectedPatient.email}
                              className="form-checkbox"
                            />
                            <span className="text-sm">✉️ Email</span>
                            {!selectedPatient.email && <span className="text-xs text-gray-400">(non renseigné)</span>}
                          </label>
                          <label className={`flex items-center gap-2 p-2 rounded ${selectedPatient.phone ? 'bg-gray-50' : 'bg-gray-100 opacity-50'}`}>
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.sms_enabled && !!selectedPatient.phone}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, sms_enabled: e.target.checked }))}
                              disabled={!selectedPatient.phone}
                              className="form-checkbox"
                            />
                            <span className="text-sm">📱 SMS</span>
                            {!selectedPatient.phone && <span className="text-xs text-gray-400">(non renseigné)</span>}
                          </label>
                          <label className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.push_enabled}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, push_enabled: e.target.checked }))}
                              className="form-checkbox"
                            />
                            <span className="text-sm">🔔 Push</span>
                          </label>
                        </div>
                      </div>

                      {/* Types d'alertes */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Types d&apos;alertes</label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.notify_battery_low}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, notify_battery_low: e.target.checked }))}
                              className="form-checkbox"
                            />
                            🔋 Batterie faible
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.notify_device_offline}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, notify_device_offline: e.target.checked }))}
                              className="form-checkbox"
                            />
                            📴 Dispositif hors ligne
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.notify_abnormal_flow}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, notify_abnormal_flow: e.target.checked }))}
                              className="form-checkbox"
                            />
                            ⚠️ Débit anormal
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={patientNotifPrefs.notify_alert_critical}
                              onChange={(e) => setPatientNotifPrefs(prev => ({ ...prev, notify_alert_critical: e.target.checked }))}
                              className="form-checkbox"
                            />
                            🚨 Alerte critique
                          </label>
                        </div>
                      </div>

                      <button
                        className="btn-primary text-sm"
                        onClick={savePatientNotifications}
                        disabled={savingNotifPrefs}
                      >
                        {savingNotifPrefs ? 'Enregistrement...' : '💾 Enregistrer les préférences'}
                      </button>
                    </div>
                  </div>

                  {/* Dispositif associé */}
                  <div className="card">
                    <h3 className="text-lg font-semibold mb-4">🔌 Dispositif</h3>
                    {patientDetails.device ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-lg">{patientDetails.device.device_name || 'Dispositif sans nom'}</p>
                            <p className="text-sm text-gray-500">ICCID: {patientDetails.device.sim_iccid}</p>
                          </div>
                          <span className={`badge ${patientDetails.device.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                            {patientDetails.device.status || 'inconnu'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Batterie</p>
                            <p className="font-medium">{patientDetails.device.last_battery ? `${patientDetails.device.last_battery.toFixed(1)}%` : 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Dernière connexion</p>
                            <p className="font-medium">
                              {patientDetails.device.last_seen 
                                ? new Date(patientDetails.device.last_seen).toLocaleString('fr-FR')
                                : 'Jamais'}
                            </p>
                          </div>
                        </div>
                        {patientDetails.device.latitude && patientDetails.device.longitude && (
                          <a
                            href={`/dashboard/map?deviceId=${patientDetails.device.id}`}
                            className="btn-secondary text-sm inline-block"
                          >
                            📍 Voir sur la carte
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-amber-600">Aucun dispositif attribué à ce patient</p>
                    )}
                  </div>

                  {/* Statistiques */}
                  {patientDetails.device && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="card">
                        <p className="text-sm text-gray-500">Mesures totales</p>
                        <p className="text-2xl font-semibold">{patientDetails.stats.totalMeasurements}</p>
                      </div>
                      <div className="card">
                        <p className="text-sm text-gray-500">Débit moyen</p>
                        <p className="text-2xl font-semibold">{patientDetails.stats.avgFlowrate} L/min</p>
                      </div>
                      <div className="card">
                        <p className="text-sm text-gray-500">Batterie actuelle</p>
                        <p className="text-2xl font-semibold">
                          {patientDetails.device.last_battery ? `${patientDetails.device.last_battery.toFixed(0)}%` : 'N/A'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Alertes */}
                  {patientDetails.alerts.length > 0 && (
                    <div className="card">
                      <h3 className="text-lg font-semibold mb-4">🚨 Alertes ({patientDetails.alerts.length})</h3>
                      <div className="space-y-2">
                        {patientDetails.alerts.slice(0, 5).map(alert => (
                          <div key={alert.id} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{alert.message}</p>
                              <span className={`badge ${
                                alert.severity === 'critical' ? 'badge-error' :
                                alert.severity === 'high' ? 'badge-warning' :
                                'badge-info'
                              }`}>
                                {alert.severity}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(alert.created_at).toLocaleString('fr-FR')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Graphique mesures récentes */}
                  {patientDetails.measurements.length > 0 && (
                    <div className="card">
                      <h3 className="text-lg font-semibold mb-4">📈 Mesures récentes</h3>
                      <div className="h-64">
                        <Chart data={patientDetails.measurements} type="flowrate" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500">Aucune donnée disponible</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

