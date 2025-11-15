'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function PatientsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
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

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleCreatePatient = async () => {
    if (!formData.first_name || !formData.last_name) {
      setError('Prénom et nom sont obligatoires')
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
      setSuccess('Patient créé avec succès')
      loadPatients()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">👥 Patients</h1>
        <button className="btn-primary" onClick={() => setShowForm(true)}>➕ Nouveau Patient</button>
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
                  <th className="text-left py-3 px-4">Dispositifs</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50 animate-slide-up" style={{animationDelay: `${i * 0.05}s`}}>
                    <td className="py-3 px-4 font-medium">{p.first_name} {p.last_name}</td>
                    <td className="py-3 px-4">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className="py-3 px-4">{p.phone || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="badge badge-success">{p.device_count || 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button className="btn-secondary text-sm">👁️ Détails</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Nouveau patient</h2>
              <button className="text-gray-500 hover:text-gray-900" onClick={() => setShowForm(false)}>✖</button>
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
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button className="btn-primary" onClick={handleCreatePatient} disabled={saving}>
                {saving ? 'Création...' : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

