/**
 * Composant de barre de recherche réutilisable avec debounce optionnel
 * @module components/SearchBar
 */

import { memo } from 'react'
import { useDebounce } from '@/hooks'
import { useEffect, useState } from 'react'

function SearchBar({ value, onChange, placeholder = 'Rechercher...', className = '', debounceMs = 300, debounced = false }) {
  const [localValue, setLocalValue] = useState(value)
  const debouncedValue = useDebounce(localValue, debounceMs)

  // Synchroniser avec la valeur externe si elle change
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Utiliser la valeur debouncée si activé
  useEffect(() => {
    if (debounced) {
      onChange(debouncedValue)
    }
  }, [debouncedValue, debounced, onChange])

  const handleChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    if (!debounced) {
      onChange(newValue)
    }
  }

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      className={`input ${className}`}
      placeholder={placeholder}
    />
  )
}

export default memo(SearchBar)

