'use client'

import { useState } from 'react'

/**
 * Composant Tooltip personnalisé avec support des retours à la ligne
 * @param {Object} props
 * @param {React.ReactNode} props.children - Élément qui déclenche le tooltip
 * @param {string} props.content - Contenu du tooltip (supporte \n pour les retours à la ligne)
 * @param {string} props.position - Position du tooltip: 'top', 'bottom', 'left', 'right'
 * @param {number} props.maxWidth - Largeur maximale du tooltip en pixels
 */
export default function Tooltip({ 
  children, 
  content, 
  position = 'top',
  maxWidth = 300 
}) {
  const [isVisible, setIsVisible] = useState(false)

  if (!content) return children

  // Convertir les \n en retours à la ligne réels
  const formattedContent = content.split('\n').map((line, index, array) => (
    <span key={index}>
      {line}
      {index < array.length - 1 && <br />}
    </span>
  ))

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 dark:border-t-gray-200 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 dark:border-b-gray-200 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 dark:border-l-gray-200 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 dark:border-r-gray-200 border-t-transparent border-b-transparent border-l-transparent'
  }

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div 
          className={`absolute z-50 ${positionClasses[position]}`}
          style={{ maxWidth: `${maxWidth}px` }}
        >
          <div className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-xs rounded-lg px-3 py-2 shadow-lg whitespace-normal">
            <div className="leading-relaxed">
              {formattedContent}
            </div>
          </div>
          {/* Flèche du tooltip */}
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} />
        </div>
      )}
    </div>
  )
}

