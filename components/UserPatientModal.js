'use client'

import { useState, useEffect } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'
import { isValidEmail, isValidPhone } from '@/lib/utils'
import logger from '@/lib/logger'

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
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_enabled: true,
    sms_enabled: true,
    push_enabled: type === 'user' ? true : false,
    notify_battery_low: true,
    notify_device_offline: true,
    notify_abnormal_flow: true,
    notify_new_patient: type === 'user' ? false : false,
    notify_alert_critical: type === 'patient' ? true : false
  })
  const [notificationErrors, setNotificationErrors] = useState({})

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
        setPasswordConfirm('')
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
          is_active: true // Visible aussi en création maintenant
        })
        setPasswordConfirm('')
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
      
      // Réinitialiser les préférences avec valeurs par défaut du schéma (tout désactivé)
      setNotificationPrefs({
        email_enabled: false,
        sms_enabled: false,
        push_enabled: false,
        notify_battery_low: false,
        notify_device_offline: false,
        notify_abnormal_flow: false,
        notify_new_patient: false,
        notify_alert_critical: false
      })
    }
    
    setFormErrors({})
    setFormError(null)
    setNotificationErrors({})
    setShowPassword(false)
    setShowPasswordConfirm(false)
    setPasswordConfirm('')
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
        // Convertir les booléens correctement, garder les strings (phone_number) et autres types
        const loadedPrefs = Object.fromEntries(
          Object.entries(data.preferences).map(([key, value]) => {
            // Champs booléens
            if (['email_enabled', 'sms_enabled', 'push_enabled', 
                 'notify_battery_low', 'notify_device_offline', 'notify_abnormal_flow',
                 'notify_new_patient', 'notify_alert_critical'].includes(key)) {
              return [key, Boolean(value)]
            }
            // Autres champs (phone_number, quiet_hours_start, quiet_hours_end, etc.) - garder tel quel
            return [key, value]
          })
        )
        setNotificationPrefs(loadedPrefs)
      }
    } catch (err) {
      logger.warn('Erreur chargement préférences:', err)
    } finally {
      setLoadingNotifPrefs(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    const newFormData = {
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    }
    setFormData(newFormData)
    
    // Effacer l'erreur du champ modifié
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
    
    // Validation en temps réel pour le mot de passe
    if (name === 'password' && type === 'user') {
      if (value && value.length > 0 && value.length < 6) {
        setFormErrors(prev => ({
          ...prev,
          password: 'Le mot de passe doit contenir au moins 6 caractères'
        }))
      } else if (value && value.length >= 6) {
        // Supprimer l'erreur si le mot de passe est valide
        setFormErrors(prev => {
          const next = { ...prev }
          delete next.password
          // Vérifier aussi la confirmation si elle existe
          if (passwordConfirm && passwordConfirm !== value) {
            next.passwordConfirm = 'Les mots de passe ne correspondent pas'
          } else {
            delete next.passwordConfirm
          }
          return next
        })
      } else if (!value && !editingItem) {
        // Erreur seulement si création et champ vide
        setFormErrors(prev => ({
          ...prev,
          password: 'Le mot de passe est obligatoire'
        }))
      } else if (!value && editingItem) {
        // Pas d'erreur si modification et champ vide (optionnel)
        setFormErrors(prev => {
          const next = { ...prev }
          delete next.password
          delete next.passwordConfirm
          return next
        })
      }
    }
    
    // Si email ou phone est modifié, mettre à jour les erreurs de notifications et désactiver les notifications si invalide
    if (name === 'email' || name === 'phone') {
      setNotificationErrors(prev => {
        const next = { ...prev }
        // Si email est maintenant renseigné et valide, supprimer l'erreur email
        if (name === 'email' && isValidEmail(value) && next.email) {
          delete next.email
        }
        // Si phone est maintenant renseigné et valide, supprimer l'erreur sms
        if (name === 'phone' && value && isValidPhone(value) && next.sms) {
          delete next.sms
        }
        return next
      })
      
      // Désactiver automatiquement les notifications si l'email ou le téléphone devient invalide
      setNotificationPrefs(prev => {
        const updated = { ...prev }
        if (name === 'email') {
          if (!isValidEmail(value) && prev.email_enabled) {
            updated.email_enabled = false
            // Si aucun service n'est activé, désactiver aussi les alertes
            if (!updated.sms_enabled && !updated.push_enabled) {
              updated.notify_battery_low = false
              updated.notify_device_offline = false
              updated.notify_abnormal_flow = false
              if (type === 'user') {
                updated.notify_new_patient = false
              } else {
                updated.notify_alert_critical = false
              }
            }
          }
        } else if (name === 'phone') {
          if ((!value || !isValidPhone(value)) && prev.sms_enabled) {
            updated.sms_enabled = false
            // Si aucun service n'est activé, désactiver aussi les alertes
            if (!updated.email_enabled && !updated.push_enabled) {
              updated.notify_battery_low = false
              updated.notify_device_offline = false
              updated.notify_abnormal_flow = false
              if (type === 'user') {
                updated.notify_new_patient = false
              } else {
                updated.notify_alert_critical = false
              }
            }
          }
        }
        return updated
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
      // Validation confirmation mot de passe
      if (formData.password && formData.password.length >= 6) {
        if (!editingItem && (!passwordConfirm || passwordConfirm !== formData.password)) {
          errors.passwordConfirm = 'Les mots de passe ne correspondent pas'
        }
        if (editingItem && passwordConfirm && passwordConfirm !== formData.password) {
          errors.passwordConfirm = 'Les mots de passe ne correspondent pas'
        }
        // Si en édition et qu'un mot de passe est saisi, la confirmation est requise
        if (editingItem && formData.password && formData.password.length > 0 && !passwordConfirm) {
          errors.passwordConfirm = 'Veuillez confirmer le mot de passe'
        }
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
          is_active: formData.is_active !== undefined && formData.is_active !== null ? Boolean(formData.is_active) : true,
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
        // IMPORTANT: Ne pas utiliser try/catch silencieux - si ça échoue, on doit le savoir
        const notifEndpoint = type === 'user'
          ? `/api.php/users/${editingItem.id}/notifications`
          : `/api.php/patients/${editingItem.id}/notifications`
        
        // S'assurer que toutes les valeurs sont des booléens avant l'envoi
        // Convertir les chaînes vides en false pour éviter les erreurs SQL
        const prefsToSave = {
          email_enabled: Boolean(notificationPrefs.email_enabled ?? false),
          sms_enabled: Boolean(notificationPrefs.sms_enabled ?? false),
          push_enabled: Boolean(notificationPrefs.push_enabled ?? false),
          notify_battery_low: Boolean(notificationPrefs.notify_battery_low ?? false),
          notify_device_offline: Boolean(notificationPrefs.notify_device_offline ?? false),
          notify_abnormal_flow: Boolean(notificationPrefs.notify_abnormal_flow ?? false)
        }
        
        // Ajouter phone_number seulement s'il n'est pas vide (unifié - gérer null/undefined)
        const phoneFromForm = formData.phone && typeof formData.phone === 'string' ? formData.phone.trim() : null
        const phoneFromPrefs = notificationPrefs.phone_number && typeof notificationPrefs.phone_number === 'string' ? notificationPrefs.phone_number.trim() : null
        const phoneNumber = phoneFromForm || phoneFromPrefs
        if (phoneNumber && phoneNumber.length > 0) {
          prefsToSave.phone_number = phoneNumber
        }
        
        // Ajouter les champs spécifiques selon le type
        if (type === 'user') {
          prefsToSave.notify_new_patient = Boolean(notificationPrefs.notify_new_patient ?? false)
        } else {
          prefsToSave.notify_alert_critical = Boolean(notificationPrefs.notify_alert_critical ?? false)
        }
        
        // Sauvegarder les notifications - si ça échoue, l'erreur sera propagée
        await fetchJson(
          fetchWithAuth,
          API_URL,
          notifEndpoint,
          {
            method: 'PUT',
            body: JSON.stringify(prefsToSave)
          },
          { requiresAuth: true }
        )
      } else {
        // Création
        const endpoint = type === 'user' ? '/api.php/users' : '/api.php/patients'
        
        const payload = type === 'user' ? {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim(),
          password: formData.password.trim(),
          role_id: parseInt(formData.role_id, 10),
          is_active: formData.is_active !== undefined && formData.is_active !== null ? Boolean(formData.is_active) : true,
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
        // IMPORTANT: Ne pas utiliser try/catch silencieux - si ça échoue, on doit le savoir
        if (response.user_id || response.patient_id) {
          const newId = response.user_id || response.patient_id
          const notifEndpoint = type === 'user'
            ? `/api.php/users/${newId}/notifications`
            : `/api.php/patients/${newId}/notifications`
          
          // S'assurer que toutes les valeurs sont des booléens avant l'envoi
          // Convertir les chaînes vides en false pour éviter les erreurs SQL
          const prefsToSave = {
            email_enabled: Boolean(notificationPrefs.email_enabled ?? false),
            sms_enabled: Boolean(notificationPrefs.sms_enabled ?? false),
            push_enabled: Boolean(notificationPrefs.push_enabled ?? false),
            notify_battery_low: Boolean(notificationPrefs.notify_battery_low ?? false),
            notify_device_offline: Boolean(notificationPrefs.notify_device_offline ?? false),
            notify_abnormal_flow: Boolean(notificationPrefs.notify_abnormal_flow ?? false)
          }
          
          // Ajouter phone_number seulement s'il n'est pas vide (unifié - gérer null/undefined)
          const phoneFromForm = formData.phone && typeof formData.phone === 'string' ? formData.phone.trim() : null
          const phoneFromPrefs = notificationPrefs.phone_number && typeof notificationPrefs.phone_number === 'string' ? notificationPrefs.phone_number.trim() : null
          const phoneNumber = phoneFromForm || phoneFromPrefs
          if (phoneNumber && phoneNumber.length > 0) {
            prefsToSave.phone_number = phoneNumber
          }
          
          // Ajouter les champs spécifiques selon le type
          if (type === 'user') {
            prefsToSave.notify_new_patient = Boolean(notificationPrefs.notify_new_patient ?? false)
          } else {
            prefsToSave.notify_alert_critical = Boolean(notificationPrefs.notify_alert_critical ?? false)
          }
          
          // Sauvegarder les notifications - si ça échoue, l'erreur sera propagée
          await fetchJson(
            fetchWithAuth,
            API_URL,
            notifEndpoint,
            {
              method: 'PUT',
              body: JSON.stringify(prefsToSave)
            },
            { requiresAuth: true }
          )
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
      logger.error('Erreur enregistrement:', err)
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                    {editingItem ? 'Nouveau mot de passe' : 'Mot de passe *'}
                    <div className="relative mt-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password || ''}
                        onChange={handleInputChange}
                        placeholder={editingItem ? 'Optionnel, 6+ caractères' : '6+ caractères'}
                        className={`input pr-10 ${formErrors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                        required={!editingItem}
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                  </label>
                  {formErrors.password && (
                    <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.password}</p>
                  )}
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                    {editingItem ? 'Confirmer le nouveau mot de passe' : 'Confirmer le mot de passe *'}
                    <div className="relative mt-1">
                      <input
                        type={showPasswordConfirm ? 'text' : 'password'}
                        value={passwordConfirm}
                        onChange={(e) => {
                          const value = e.target.value
                          setPasswordConfirm(value)
                          // Validation en temps réel
                          if (formData.password && value !== formData.password) {
                            setFormErrors(prev => ({
                              ...prev,
                              passwordConfirm: 'Les mots de passe ne correspondent pas'
                            }))
                          } else {
                            setFormErrors(prev => {
                              const next = { ...prev }
                              delete next.passwordConfirm
                              return next
                            })
                          }
                        }}
                        placeholder={editingItem ? 'Optionnel, 6+ caractères' : '6+ caractères'}
                        className={`input pr-10 ${formErrors.passwordConfirm ? 'border-red-500 focus:border-red-500 focus:ring-red-500/50' : ''}`}
                        required={!editingItem || (editingItem && formData.password && formData.password.length > 0)}
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        title={showPasswordConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPasswordConfirm ? '👁️' : '👁️‍🗨️'}
                      </button>
                    </div>
                  </label>
                  {formErrors.passwordConfirm && (
                    <p className="text-red-600 dark:text-red-400 text-xs mt-1">{formErrors.passwordConfirm}</p>
                  )}
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active !== undefined ? formData.is_active : true}
                      onChange={handleInputChange}
                      className="form-checkbox h-4 w-4 text-primary-600 dark:text-primary-400"
                    />
                    Compte actif
                  </label>
                </div>
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
          <div className="border-t border-gray-200/80 dark:border-slate-700/50 pt-4 mt-4">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">📧 Notifications</h3>
            
            {editingItem && loadingNotifPrefs ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Chargement des préférences...</div>
            ) : (
                <div className="space-y-4">
                  {/* Canaux de notification */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Canaux activés</label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={`flex items-center gap-2 p-2 rounded transition-colors ${
                          notificationPrefs.email_enabled && isValidEmail(formData.email)
                            ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 font-semibold'
                            : isValidEmail(formData.email)
                            ? 'bg-gray-50 border border-gray-200'
                            : 'bg-gray-100 opacity-50 border border-gray-200'
                        }`}>
                          <input
                            type="checkbox"
                            checked={notificationPrefs.email_enabled}
                            onChange={(e) => {
                              const newValue = e.target.checked
                              if (newValue && !isValidEmail(formData.email)) {
                                setNotificationErrors(prev => ({ ...prev, email: 'Email valide requis pour activer les notifications email' }))
                                return
                              }
                              setNotificationErrors(prev => {
                                const next = { ...prev }
                                delete next.email
                                delete next.alerts
                                return next
                              })
                              const updatedPrefs = { ...notificationPrefs, email_enabled: newValue }
                              // Si aucun service n'est activé après cette modification, désactiver les alertes
                              if (!newValue && !updatedPrefs.sms_enabled && !updatedPrefs.push_enabled) {
                                updatedPrefs.notify_battery_low = false
                                updatedPrefs.notify_device_offline = false
                                updatedPrefs.notify_abnormal_flow = false
                                if (type === 'user') {
                                  updatedPrefs.notify_new_patient = false
                                } else {
                                  updatedPrefs.notify_alert_critical = false
                                }
                              }
                              setNotificationPrefs(updatedPrefs)
                            }}
                            disabled={!isValidEmail(formData.email)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">✉️ Email</span>
                        </label>
                        {!isValidEmail(formData.email) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-8">
                            Saisissez un email valide pour activer les notifications email
                          </p>
                        )}
                        {notificationErrors.email && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-8">{notificationErrors.email}</p>
                        )}
                      </div>
                      <div>
                        <label className={`flex items-center gap-2 p-2 rounded transition-colors ${
                          notificationPrefs.sms_enabled && formData.phone && isValidPhone(formData.phone)
                            ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 font-semibold'
                            : formData.phone && isValidPhone(formData.phone)
                            ? 'bg-gray-50 border border-gray-200'
                            : 'bg-gray-100 opacity-50 border border-gray-200'
                        }`}>
                          <input
                            type="checkbox"
                            checked={Boolean(notificationPrefs.sms_enabled)}
                            onChange={(e) => {
                              const newValue = e.target.checked
                              if (newValue && (!formData.phone || !isValidPhone(formData.phone))) {
                                setNotificationErrors(prev => ({ ...prev, sms: 'Téléphone valide requis pour activer les notifications SMS' }))
                                return
                              }
                              setNotificationErrors(prev => {
                                const next = { ...prev }
                                delete next.sms
                                delete next.alerts
                                return next
                              })
                              const updatedPrefs = { ...notificationPrefs, sms_enabled: newValue }
                              // Si aucun service n'est activé après cette modification, désactiver les alertes
                              if (!newValue && !updatedPrefs.email_enabled && !updatedPrefs.push_enabled) {
                                updatedPrefs.notify_battery_low = false
                                updatedPrefs.notify_device_offline = false
                                updatedPrefs.notify_abnormal_flow = false
                                if (type === 'user') {
                                  updatedPrefs.notify_new_patient = false
                                } else {
                                  updatedPrefs.notify_alert_critical = false
                                }
                              }
                              setNotificationPrefs(updatedPrefs)
                            }}
                            disabled={!formData.phone || !isValidPhone(formData.phone)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">📱 SMS</span>
                        </label>
                        {(!formData.phone || !isValidPhone(formData.phone)) && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-8">
                            Saisissez un numéro de téléphone valide pour activer les notifications SMS
                          </p>
                        )}
                        {notificationErrors.sms && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-8">{notificationErrors.sms}</p>
                        )}
                      </div>
                      <div>
                        <label className={`flex items-center gap-2 p-2 rounded transition-colors ${
                          notificationPrefs.push_enabled
                            ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 font-semibold'
                            : 'bg-gray-50 border border-gray-200'
                        }`}>
                          <input
                            type="checkbox"
                            checked={notificationPrefs.push_enabled}
                            onChange={async (e) => {
                              const newValue = e.target.checked
                              if (newValue) {
                                // Vérifier le support des notifications push
                                if (typeof window === 'undefined' || !('Notification' in window)) {
                                  setNotificationErrors(prev => ({ ...prev, push: 'Votre navigateur ne supporte pas les notifications push' }))
                                  return
                                }
                                if (!('serviceWorker' in navigator)) {
                                  setNotificationErrors(prev => ({ ...prev, push: 'Service Worker non disponible (nécessite HTTPS)' }))
                                  return
                                }
                                // Vérifier la permission
                                if (Notification.permission === 'denied') {
                                  setNotificationErrors(prev => ({ ...prev, push: 'Notifications push refusées. Autorisez-les dans les paramètres du navigateur.' }))
                                  return
                                }
                                if (Notification.permission === 'default') {
                                  try {
                                    const permission = await Notification.requestPermission()
                                    if (permission !== 'granted') {
                                      setNotificationErrors(prev => ({ ...prev, push: 'Permission de notification refusée' }))
                                      return
                                    }
                                  } catch (err) {
                                    setNotificationErrors(prev => ({ ...prev, push: 'Erreur lors de la demande de permission' }))
                                    return
                                  }
                                }
                              }
                              setNotificationErrors(prev => {
                                const next = { ...prev }
                                delete next.push
                                delete next.alerts
                                return next
                              })
                              const updatedPrefs = { ...notificationPrefs, push_enabled: newValue }
                              // Si aucun service n'est activé après cette modification, désactiver les alertes
                              if (!newValue && !updatedPrefs.email_enabled && !updatedPrefs.sms_enabled) {
                                updatedPrefs.notify_battery_low = false
                                updatedPrefs.notify_device_offline = false
                                updatedPrefs.notify_abnormal_flow = false
                                if (type === 'user') {
                                  updatedPrefs.notify_new_patient = false
                                } else {
                                  updatedPrefs.notify_alert_critical = false
                                }
                              }
                              setNotificationPrefs(updatedPrefs)
                            }}
                            className="form-checkbox"
                          />
                          <span className="text-sm">🔔 Push</span>
                          {typeof window !== 'undefined' && (!('Notification' in window) || !('serviceWorker' in navigator)) && (
                            <span className="text-xs text-gray-400">(non supporté)</span>
                          )}
                        </label>
                        {notificationErrors.push && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-8">{notificationErrors.push}</p>
                        )}
                      </div>
                    </div>
                    
                    {/* Avertissement si canal activé mais aucune alerte */}
                    {((notificationPrefs.email_enabled || notificationPrefs.sms_enabled || notificationPrefs.push_enabled) && 
                      !notificationPrefs.notify_battery_low && 
                      !notificationPrefs.notify_device_offline && 
                      !notificationPrefs.notify_abnormal_flow && 
                      !(type === 'user' ? notificationPrefs.notify_new_patient : notificationPrefs.notify_alert_critical)) && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          ⚠️ <strong>Important :</strong> Vous avez activé un canal de notification (Email/SMS/Push), mais aucun type d&apos;alerte n&apos;est activé. 
                          Activez au moins un type d&apos;alerte ci-dessous pour recevoir des notifications, sinon cela ne servira à rien.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Types d'alertes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Types d&apos;alertes
                      {(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) && (
                        <span className="text-xs text-red-600 dark:text-red-400 ml-2">
                          ⚠️ Activez au moins un service (Email/SMS/Push) pour activer les alertes
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`flex items-center gap-2 text-sm ${(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs.notify_battery_low)}
                          disabled={!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled}
                          onChange={(e) => {
                            if (!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) {
                              setNotificationErrors(prev => ({ ...prev, alerts: 'Activez au moins un service de notification pour activer les alertes' }))
                              return
                            }
                            setNotificationErrors(prev => {
                              const next = { ...prev }
                              delete next.alerts
                              return next
                            })
                            setNotificationPrefs(prev => ({ ...prev, notify_battery_low: e.target.checked }))
                          }}
                          className="form-checkbox"
                        />
                        🔋 Batterie faible
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs.notify_device_offline)}
                          disabled={!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled}
                          onChange={(e) => {
                            if (!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) {
                              setNotificationErrors(prev => ({ ...prev, alerts: 'Activez au moins un service de notification pour activer les alertes' }))
                              return
                            }
                            setNotificationErrors(prev => {
                              const next = { ...prev }
                              delete next.alerts
                              return next
                            })
                            setNotificationPrefs(prev => ({ ...prev, notify_device_offline: e.target.checked }))
                          }}
                          className="form-checkbox"
                        />
                        📴 Dispositif hors ligne
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPrefs.notify_abnormal_flow)}
                          disabled={!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled}
                          onChange={(e) => {
                            if (!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) {
                              setNotificationErrors(prev => ({ ...prev, alerts: 'Activez au moins un service de notification pour activer les alertes' }))
                              return
                            }
                            setNotificationErrors(prev => {
                              const next = { ...prev }
                              delete next.alerts
                              return next
                            })
                            setNotificationPrefs(prev => ({ ...prev, notify_abnormal_flow: e.target.checked }))
                          }}
                          className="form-checkbox"
                        />
                        ⚠️ Débit anormal
                      </label>
                      {type === 'user' ? (
                        <label className={`flex items-center gap-2 text-sm ${(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(notificationPrefs.notify_new_patient)}
                            disabled={!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled}
                            onChange={(e) => {
                              if (!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) {
                                setNotificationErrors(prev => ({ ...prev, alerts: 'Activez au moins un service de notification pour activer les alertes' }))
                                return
                              }
                              setNotificationErrors(prev => {
                                const next = { ...prev }
                                delete next.alerts
                                return next
                              })
                              setNotificationPrefs(prev => ({ ...prev, notify_new_patient: e.target.checked }))
                            }}
                            className="form-checkbox"
                          />
                          👤 Nouveau patient
                        </label>
                      ) : (
                        <label className={`flex items-center gap-2 text-sm ${(!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) ? 'opacity-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(notificationPrefs.notify_alert_critical)}
                            disabled={!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled}
                            onChange={(e) => {
                              if (!notificationPrefs.email_enabled && !notificationPrefs.sms_enabled && !notificationPrefs.push_enabled) {
                                setNotificationErrors(prev => ({ ...prev, alerts: 'Activez au moins un service de notification pour activer les alertes' }))
                                return
                              }
                              setNotificationErrors(prev => {
                                const next = { ...prev }
                                delete next.alerts
                                return next
                              })
                              setNotificationPrefs(prev => ({ ...prev, notify_alert_critical: e.target.checked }))
                            }}
                            className="form-checkbox"
                          />
                          🚨 Alerte critique
                        </label>
                      )}
                    </div>
                    {notificationErrors.alerts && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-2">{notificationErrors.alerts}</p>
                    )}
                  </div>
                </div>
            )}
          </div>

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

