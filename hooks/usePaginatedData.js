/**
 * Hook pour gérer la pagination et le tri
 * Pattern dupliqué dans: devices, patients, measurements, users, etc.
 */

import { useState, useMemo, useCallback } from 'react'

export function usePaginatedData(data = [], options = {}) {
  const {
    initialPage = 1,
    itemsPerPage = 10,
    initialSortKey = null,
    initialSortDirection = 'asc'
  } = options

  const [currentPage, setCurrentPage] = useState(initialPage)
  const [sortKey, setSortKey] = useState(initialSortKey)
  const [sortDirection, setSortDirection] = useState(initialSortDirection)
  const [searchQuery, setSearchQuery] = useState('')

  // Filtrer les données selon la recherche
  const filteredData = useMemo(() => {
    if (!searchQuery) return data

    const query = searchQuery.toLowerCase()
    return data.filter(item => 
      Object.values(item).some(value => 
        String(value).toLowerCase().includes(query)
      )
    )
  }, [data, searchQuery])

  // Trier les données
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      if (aVal === bVal) return 0

      const comparison = aVal > bVal ? 1 : -1
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredData, sortKey, sortDirection])

  // Paginer les données
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return sortedData.slice(startIndex, endIndex)
  }, [sortedData, currentPage, itemsPerPage])

  // Calculer les infos de pagination
  const totalPages = Math.ceil(sortedData.length / itemsPerPage)
  const hasNextPage = currentPage < totalPages
  const hasPrevPage = currentPage > 1

  // Actions
  const goToPage = useCallback((page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }, [totalPages])

  const nextPage = useCallback(() => {
    if (hasNextPage) setCurrentPage(prev => prev + 1)
  }, [hasNextPage])

  const prevPage = useCallback(() => {
    if (hasPrevPage) setCurrentPage(prev => prev - 1)
  }, [hasPrevPage])

  const handleSort = useCallback((key) => {
    if (sortKey === key) {
      // Toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setCurrentPage(1) // Reset à la première page
  }, [sortKey])

  const resetPagination = useCallback(() => {
    setCurrentPage(1)
    setSortKey(initialSortKey)
    setSortDirection(initialSortDirection)
    setSearchQuery('')
  }, [initialSortKey, initialSortDirection])

  return {
    // Données
    paginatedData,
    totalItems: sortedData.length,
    totalPages,
    
    // Pagination
    currentPage,
    hasNextPage,
    hasPrevPage,
    goToPage,
    nextPage,
    prevPage,
    
    // Tri
    sortKey,
    sortDirection,
    handleSort,
    
    // Recherche
    searchQuery,
    setSearchQuery,
    
    // Reset
    resetPagination
  }
}

export default usePaginatedData

