/**
 * Hook personnalisé pour gérer les formulaires
 * Élimine la duplication de code pour la gestion des formulaires
 * @module hooks/useForm
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer un formulaire avec validation et soumission
 * @param {Object} initialValues - Valeurs initiales du formulaire
 * @param {Function} onSubmit - Fonction appelée à la soumission
 * @param {Function} validate - Fonction de validation (optionnelle)
 * @returns {Object} { values, errors, loading, handleChange, handleSubmit, reset, setValues, setErrors }
 */
export function useForm(initialValues, onSubmit, validate = null) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const handleChange = useCallback((name, value) => {
    setValues(prev => ({
      ...prev,
      [name]: value
    }))
    // Effacer l'erreur du champ modifié (utiliser la fonction de callback pour accéder à l'état actuel)
    setErrors(prev => {
      if (prev[name]) {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      }
      return prev
    })
  }, [])

  const handleSubmit = useCallback(async (e) => {
    if (e) {
      e.preventDefault()
    }

    // Validation
    if (validate) {
      const validationErrors = validate(values)
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors)
        return
      }
    }

    setLoading(true)
    setErrors({})

    try {
      await onSubmit(values)
    } catch (err) {
      setErrors({ submit: err.message || 'Erreur lors de la soumission' })
      throw err
    } finally {
      setLoading(false)
    }
  }, [values, onSubmit, validate])

  const reset = useCallback(() => {
    setValues(initialValues)
    setErrors({})
    setLoading(false)
  }, [initialValues])

  return {
    values,
    errors,
    loading,
    handleChange,
    handleSubmit,
    reset,
    setValues,
    setErrors
  }
}

