'use client'

import Modal from './Modal'

/**
 * Modal de confirmation réutilisable
 * @param {boolean} isOpen - Modal ouvert/fermé
 * @param {function} onClose - Callback fermeture
 * @param {function} onConfirm - Callback confirmation principale
 * @param {function} onSecondAction - Callback action secondaire optionnelle (pour admins)
 * @param {string} title - Titre du modal
 * @param {string} message - Message de confirmation
 * @param {string} confirmText - Texte bouton confirmer (défaut: "Confirmer")
 * @param {string} secondActionText - Texte bouton secondaire optionnel
 * @param {string} cancelText - Texte bouton annuler (défaut: "Annuler")
 * @param {string} variant - Style: 'danger', 'warning', 'info' (défaut: 'info')
 * @param {string} secondActionVariant - Style bouton secondaire: 'danger', 'warning' (défaut: 'danger')
 * @param {boolean} loading - Afficher spinner sur bouton confirmer
 */
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  onSecondAction,
  title,
  message,
  confirmText = 'Confirmer',
  secondActionText,
  cancelText = 'Annuler',
  variant = 'info',
  secondActionVariant = 'danger',
  loading = false
}) {
  const variantStyles = {
    danger: {
      icon: '⚠️',
      confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
      iconBg: 'bg-red-100 dark:bg-red-900/30'
    },
    warning: {
      icon: '⚠️',
      confirmClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      iconBg: 'bg-yellow-100 dark:bg-yellow-900/30'
    },
    info: {
      icon: 'ℹ️',
      confirmClass: 'bg-blue-600 hover:bg-blue-700 text-white',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30'
    },
    success: {
      icon: '✓',
      confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
      iconBg: 'bg-green-100 dark:bg-green-900/30'
    }
  }

  const style = variantStyles[variant] || variantStyles.info

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Icône et message */}
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center text-2xl`}>
            {style.icon}
          </div>
          <div className="flex-1 pt-1">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {message}
            </p>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${style.confirmClass}`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmText}
          </button>
          {onSecondAction && secondActionText && (
            <button
              onClick={onSecondAction}
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                secondActionVariant === 'danger' 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {secondActionText}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

