'use client'

/**
 * Composant Modal réutilisable avec style unifié
 * Utilise le même style que les modaux de la page patients
 */
export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className={`bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg p-6 ${maxWidth} w-full mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || onClose) && (
          <div className="flex items-center justify-between mb-4">
            {title && (
              <h2 className="text-xl font-bold">
                {title}
              </h2>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Fermer"
                aria-label="Fermer"
              >
                <span className="text-2xl font-bold leading-none">×</span>
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

