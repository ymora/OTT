'use client'

import { useState, useEffect } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'

/**
 * Composant modal réutilisable pour créer/modifier des utilisateurs ou patients
 * @param {Object} props
 * @param {boolean} props.isOpen - Si le modal est ouvert
 * @param {Function} props.onClose - Fonction pour fermer le modal
 * @param {Object|null} props.editingItem - L'item en cours d'édition (null pour création)
 * @param {string} props.type - 'user' ou 'patient'
 * @param {Function} props.onSave - Fonction appelée après sauvegarde réussie
 * @param {Object} props.fetchWithAuth - Fonction fetch avec authentification
 * @param {string} props.API_URL - URL de l'API
 * @param {Array} props.roles - Liste des rôles (pour type='user')
 */
export default function UserPatientModal({
  isOpen,
  onClose,
  editingItem,
  type,
  onSave,
  fetchWithAuth,
  API_URL,
  roles = []
}) {
  const [formData, setFormData] = useState({})
  const [formErrors, setFormErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingNotifPrefs, setLoadingNotifPrefs] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_enabled: true,
    sms_enabled: true,
    push_enabled: type === 'user' ? true : false,
    notify_battery_low: true,
    notify_device_offline: true,
    notify_abnormal_flow: true,
    notify_new_patient: type === 'user' ? false : undefined,
    notify_alert_critical: type === 'patient' ? true : undefined
  })

  // Initialiser le formulaire
  useEffect(() => {
    if (!isOpen) return

    if (editingItem) {
      // Mode édition
      if (type === 'user') {
        setFormData({
          first_name: editingItem.first_name || '',
          last_name: editingItem.last_name || '',
          email: editingItem.email || '',
          phone: editingItem.phone || '',
          password: '',
          role_id: roles.find(r => r.name === editingItem.role_name)?.id || '',
          is_active: Boolean(editingItem.is_active)
        })
      } else {
        setFormData({
          first_name: editingItem.first_name || '',
          last_name: editingItem.last_name || '',
          birth_date: editingItem.birth_date ? editingItem.birth_date.split('T')[0] : '',
          phone: editingItem.phone || '',
          email: editingItem.email || '',
          city: editingItem.city || '',
          postal_code: editingItem.postal_code || ''
        })
      }
      
      // Charger les préférences de notifications
      loadNotificationPrefs()
    } else {
      // Mode création
      if (type === 'user') {
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          password: '',
          role_id: '',
          is_active: true
        })
      } else {
        setFormData({
          first_name: '',
          last_name: '',
          birth_date: '',
          phone: '',
          email: '',
          city: '',
          postal_code: ''
        })
      }
      
      // Réinitialiser les préférences avec valeurs par défaut du schéma
      setNotificationPrefs({
        email_enabled: true,
        sms_enabled: true,
        push_enabled: type === 'user' ? true : false,
        notify_battery_low: true,
        notify_device_offline: true,
        notify_abnormal_flow: true,
        notify_new_patient: type === 'user' ? false : undefined,
        notify_alert_critical: type === 'patient' ? true : undefined
      })
    }
    
    setFormErrors({})
    setFormError(null)
  }, [isOpen, editingItem, type, roles])

  const loadNotificationPrefs = async () => {
    if (!editingItem?.id) return
    
    try {
      setLoadingNotifPrefs(true)
      const endpoint = type === 'user' 
        ? `/api.php/users/${editingItem.id}/notifications`
        : `/api.php/patients/${editingItem.id}/notifications`
      
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        endpoint,
        {},
        { requiresAuth: true }
      )
      
      if (data.preferences) {
        setNotificationPrefs(data.preferences)
      }
    } catch (err) {
      console.warn('Erreur chargement préférences:', err)
    } finally {
      setLoadingNotifPrefs(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    // Effacer l'erreur du champ modifié
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const validateForm = () => {
    const errors = {}
    
    // Validation commune
    if (!formData.first_name || formData.first_name.trim().length < 2) {
      errors.first_name = 'Le prénom doit contenir au moins 2 caractères'
    }
    if (!formData.last_name || formData.last_name.trim().length < 2) {
      errors.last_name = 'Le nom doit contenir au moins 2 caractères'
    }
    
    // Validation spécifique utilisateur
    if (type === 'user') {
      if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) {
        errors.email = 'Format d\'email invalide'
      }
      if (!editingItem && (!formData.password || formData.password.length < 6)) {
        errors.password = 'Le mot de passe doit contenir au moins 6 caractères'
      }
      if (!formData.role_id) {
        errors.role_id = 'Le rôle est obligatoire'
      }
    }
    
    // Validation spécifique patient
    if (type === 'patient') {
      if (formData.postal_code && !/^\d{5}$/.test(formData.postal_code.trim())) {
        errors.postal_code = 'Le code postal doit contenir 5 chiffres'
      }
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) {
      setFormError('Veuillez corriger les erreurs dans le formulaire')
      return
    }
    
    setSaving(true)
    setFormError(null)
    
    try {
      if (editingItem) {
        // Modification
        const endpoint = type === 'user'
          ? `/api.php/users/${editingItem.id}`
          : `/api.php/patients/${editingItem.id}`
        
        const payload = type === 'user' ? {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          role_id: formData.role_id ? parseInt(formData.role_id, 10) : undefined,
          is_active: Boolean(formData.is_active),
          phone: formData.phone && formData.phone.trim().length > 0 ? formData.phone.trim() : null
        } : {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          birth_date: formData.birth_date || null,
          phone: formData.phone && formData.phone.trim().length > 0 ? formData.phone.trim() : null,
          email: formData.email && formData.email.trim().length > 0 ? formData.email.trim() : null,
          city: formData.city && formData.city.trim().length > 0 ? formData.city.trim() : null,
          postal_code: formData.postal_code && formData.postal_code.trim().length > 0 ? formData.postal_code.trim() : null
        }
        
        if (type === 'user' && formData.password && formData.password.trim().length >= 6) {
          payload.password = formData.password.trim()
        }
        
        await fetchJson(
          fetchWithAuth,
          API_URL,
          endpoint,
          { method: 'PUT', body: JSON.stringify(payload) },
          { requiresAuth: true }
        )
        
        // Sauvegarder les préférences de notifications
        try {
          const notifEndpoint = type === 'user'
            ? `/api.php/users/${editingItem.id}/notifications`
            : `/api.php/patients/${editingItem.id}/notifications`
          
          await fetchJson(
            fetchWithAuth,
            API_URL,
            notifEndpoint,
            {
              method: 'PUT',
              body: JSON.stringify({
                ...notificationPrefs,
                phone_number: formData.phone || notificationPrefs.phone_number || ''
              })
            },
            { requiresAuth: true }
          )
        } catch (notifErr) {
          console.warn('Erreur sauvegarde notifications:', notifErr)
        }
      } else {
        // Création
        const endpoint = type === 'user' ? '/api.php/users' : '/api.php/patients'
        
        const payload = type === 'user' ? {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          password: formData.password.trim(),
          role_id: parseInt(formData.role_id, 10),
          phone: formData.phone && formData.phone.trim().length > 0 ? formData.phone.trim() : null
        } : {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          birth_date: formData.birth_date || null,
          phone: formData.phone && formData.phone.trim().length > 0 ? formData.phone.trim() : null,
          email: formData.email && formData.email.trim().length > 0 ? formData.email.trim() : null,
          city: formData.city && formData.city.trim().length > 0 ? formData.city.trim() : null,
          postal_code: formData.postal_code && formData.postal_code.trim().length > 0 ? formData.postal_code.trim() : null
        }
        
        const response = await fetchJson(
          fetchWithAuth,
          API_URL,
          endpoint,
          { method: 'POST', body: JSON.stringify(payload) },
          { requiresAuth: true }
        )
        
        // Sauvegarder les préférences de notifications pour le nouvel utilisateur/patient
        if (response.user_id || response.patient_id) {
          try {
            const newId = response.user_id || response.patient_id
            const notifEndpoint = type === 'user'
              ? `/api.php/users/${newId}/notifications`
              : `/api.php/patients/${newId}/notifications`
            
            await fetchJson(
              fetchWithAuth,
              API_URL,
              notifEndpoint,
              {
                method: 'PUT',
                body: JSON.stringify({
                  ...notificationPrefs,
                  phone_number: formData.phone || notificationPrefs.phone_number || ''
                })
              },
              { requiresAuth: true }
            )
          } catch (notifErr) {
            console.warn('Erreur sauvegarde notifications:', notifErr)
          }
        }
      }
      
      onSave()
      onClose()
    } catch (err) {
      let errorMessage = err.message || 'Erreur lors de l\'enregistrement'
      if (err.error) {
        errorMessage = err.error
      }
      setFormError(errorMessage)
      console.error('Erreur enregistrement:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm">
      <div className="bg-gradient-to-br from-white to-gray-50/80 dark:from-slate-800/95 dark:to-slate-800/80 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-scale-in my-8 backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {editingItem ? `Modifier le ${type === 'user' ? 'utilisateur' : 'patient'}` : `Nouveau ${type === 'user' ? 'utilisateur' : 'patient'}`}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {editingItem ? (editingItem.email || `${editingItem.first_name} ${editingItem.last_name}`) : `Créer un ${type === 'user' ? 'accès avec un rôle défini' : 'nouveau patient'}`}
            </p>
          </div>
          <button 
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" 
            onClick={onClose} 
            disabled={saving}
          >
            ✕
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Prénom *
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name || ''}
                  onChange={handleInputChange}
                  className={`input mt-1 ${formErrors.first_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                  required
                />
              </label>
              {formErrors.first_name && (
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.first_name}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Nom *
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name || ''}
                  onChange={handleInputChange}
                  className={`input mt-1 ${formErrors.last_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                  required
                />
              </label>
              {formErrors.last_name && (
                <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.last_name}</p>
              )}
            </div>
          </div>

          {/* Champs spécifiques utilisateur */}
          {type === 'user' && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                  Email *
                  <input
                    type="email"
                    name="email"
                    value={formData.email || ''}
                    onChange={handleInputChange}
                    className={`input mt-1 ${formErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                    required
                  />
                </label>
                {formErrors.email && (
                  <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.email}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                  Rôle *
                  <select
                    name="role_id"
                    value={formData.role_id || ''}
                    onChange={handleInputChange}
                    className={`input mt-1 ${formErrors.role_id ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                    required
                  >
                    <option value="">Choisir un rôle…</option>
                    {roles.map(role => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                {formErrors.role_id && (
                  <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.role_id}</p>
                )}
              </div>

              {editingItem && (
                <label className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                    className="form-checkbox h-4 w-4 text-primary-600 dark:text-primary-400"
                  />
                  Compte actif
                </label>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                  {editingItem ? 'Nouveau mot de passe (optionnel, 6+ caractères)' : 'Mot de passe (6+ caractères) *'}
                  <input
                    type="password"
                    name="password"
                    value={formData.password || ''}
                    onChange={handleInputChange}
                    className={`input mt-1 ${formErrors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                    required={!editingItem}
                    minLength={6}
                  />
                </label>
                {formErrors.password && (
                  <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.password}</p>
                )}
              </div>
            </>
          )}

          {/* Champs spécifiques patient */}
          {type === 'patient' && (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date de naissance
                  <input
                    type="date"
                    name="birth_date"
                    value={formData.birth_date || ''}
                    onChange={handleInputChange}
                    className="input mt-1"
                  />
                </label>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                  <input
                    type="email"
                    name="email"
                    value={formData.email || ''}
                    onChange={handleInputChange}
                    className="input mt-1"
                  />
                </label>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ville
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ''}
                    onChange={handleInputChange}
                    className="input mt-1"
                  />
                </label>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Code postal
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code || ''}
                    onChange={handleInputChange}
                    className={`input mt-1 ${formErrors.postal_code ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                  />
                </label>
                {formErrors.postal_code && (
                  <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.postal_code}</p>
                )}
              </div>
            </>
          )}

          {/* Téléphone (commun) */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
              Téléphone {type === 'user' ? '(optionnel, pour SMS)' : ''}
              <input
                type="tel"
                name="phone"
                value={formData.phone || ''}
                onChange={handleInputChange}
                className="input mt-1"
                placeholder={type === 'user' ? '+33612345678' : '+33...'}
              />
            </label>
          </div>

          <ErrorMessage error={formError} onClose={() => setFormError(null)} />

          {/* Section Notifications */}
          {editingItem && (
            <div className="border-t border-gray-200/80 dark:border-slate-700/50 pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">📧 Notifications</h3>
              
              {loadingNotifPrefs ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Chargement des préférences...</div>
              ) : (
                <div className="space-y-4">
                  {/* Canaux de notification */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Canaux activés</label>
                    <div className="grid grid-cols-3 gap-3">
                      <label className={`flex items-center gap-2 p-2 rounded ${formData.email ? 'bg-gray-50' : 'bg-gray-100 opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={notificationPrefs.email_enabled}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
                          disabled={!formData.email}
                          className="form-checkbox"
                        />
                        <span className="text-sm">✉️ Email</span>
                        {!formData.email && <span className="text-xs text-gray-400">(non renseigné)</span>}
                      </label>
                      <label className={`flex items-center gap-2 p-2 rounded ${formData.phone ? 'bg-gray-50' : 'bg-gray-100 opacity-50'}`}>
                        <input
                          type="checkbox"
                          checked={notificationPrefs.sms_enabled}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, sms_enabled: e.target.checked }))}
                          disabled={!formData.phone}
                          className="form-checkbox"
                        />
                        <span className="text-sm">📱 SMS</span>
                        {!formData.phone && <span className="text-xs text-gray-400">(non renseigné)</span>}
                      </label>
                      <label className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                        <input
                          type="checkbox"
                          checked={notificationPrefs.push_enabled}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, push_enabled: e.target.checked }))}
                          className="form-checkbox"
                        />
                        <span className="text-sm">🔔 Push</span>
                      </label>
                    </div>
                  </div>

                  {/* Types d'alertes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Types d&apos;alertes</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={notificationPrefs.notify_battery_low}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_battery_low: e.target.checked }))}
                          className="form-checkbox"
                        />
                        🔋 Batterie faible
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={notificationPrefs.notify_device_offline}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_device_offline: e.target.checked }))}
                          className="form-checkbox"
                        />
                        📴 Dispositif hors ligne
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={notificationPrefs.notify_abnormal_flow}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_abnormal_flow: e.target.checked }))}
                          className="form-checkbox"
                        />
                        ⚠️ Débit anormal
                      </label>
                      {type === 'user' ? (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_new_patient}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_new_patient: e.target.checked }))}
                            className="form-checkbox"
                          />
                          👤 Nouveau patient
                        </label>
                      ) : (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_alert_critical}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_alert_critical: e.target.checked }))}
                            className="form-checkbox"
                          />
                          🚨 Alerte critique
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? (editingItem ? 'Enregistrement…' : 'Création…') : (editingItem ? 'Enregistrer' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

