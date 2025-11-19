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
        {title && (
          <h2 className="text-xl font-bold mb-4">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}

