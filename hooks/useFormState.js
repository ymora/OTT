import { useState, useCallback } from 'react'

/**
 * Hook pour gérer l'état d'un formulaire
 * Réduit la duplication de code pour les formulaires
 * 
 * @param {Object} initialState - État initial du formulaire
 * @returns {[Object, Function, Function, Function]} - [values, handleChange, setValues, reset]
 * 
 * @example
 * const [formData, handleChange, setFormData, reset] = useFormState({
 *   name: '',
 *   email: ''
 * })
 * 
 * <input name="name" value={formData.name} onChange={handleChange} />
 */
export function useFormState(initialState = {}) {
  const [values, setValues] = useState(initialState)

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target
    setValues(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }, [])

  const reset = useCallback(() => {
    setValues(initialState)
  }, [initialState])

  return [values, handleChange, setValues, reset]
}

