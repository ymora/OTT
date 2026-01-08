'use client'

import { useState, useCallback, memo } from 'react'

/**
 * Composant Accordion réutilisable
 * OPTIMISATION: Memo pour éviter les re-renders
 */
const Accordion = memo(function Accordion({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), [])
  
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-gray-500 dark:text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-2">
          {children}
        </div>
      )}
    </div>
  )
})

export default Accordion
