/**
 * Hook personnalisé pour gérer les filtres et la recherche
 * Élimine la duplication de code pour les filtres
 * @module hooks/useFilter
 */

import { useState, useMemo } from 'react'
import { useDebounce } from './useDebounce'

/**
 * Hook pour gérer les filtres et la recherche
 * @param {Array} items - Liste d'items à filtrer
 * @param {Object} options - Options de configuration
 * @param {Function} options.searchFn - Fonction de recherche personnalisée
 * @param {Function} options.filterFn - Fonction de filtre personnalisée
 * @param {number} options.debounceDelay - Délai de debounce pour la recherche (défaut: 300)
 * @returns {Object} { searchTerm, setSearchTerm, filters, setFilter, filteredItems, debouncedSearchTerm }
 */
export function useFilter(items = [], options = {}) {
  const { searchFn, filterFn, debounceDelay = 300 } = options

  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({})
  const debouncedSearchTerm = useDebounce(searchTerm, debounceDelay)

  const filteredItems = useMemo(() => {
    let result = items

    // Appliquer la recherche
    if (debouncedSearchTerm) {
      if (searchFn) {
        result = searchFn(result, debouncedSearchTerm)
      } else {
        // Recherche par défaut (recherche dans tous les champs string)
        const needle = debouncedSearchTerm.toLowerCase()
        result = result.filter(item => {
          return Object.values(item).some(value => {
            if (typeof value === 'string') {
              return value.toLowerCase().includes(needle)
            }
            return false
          })
        })
      }
    }

    // Appliquer les filtres
    if (filterFn) {
      result = filterFn(result, filters)
    } else {
      // Filtrage par défaut (filtre par clé/valeur)
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'ALL') {
          result = result.filter(item => {
            const itemValue = item[key]
            return String(itemValue) === String(value)
          })
        }
      })
    }

    return result
  }, [items, debouncedSearchTerm, filters, searchFn, filterFn])

  const setFilter = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const resetFilters = () => {
    setSearchTerm('')
    setFilters({})
  }

  return {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    filteredItems,
    debouncedSearchTerm,
    resetFilters
  }
}

