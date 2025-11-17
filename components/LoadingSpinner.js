/**
 * Composant de chargement réutilisable
 * @module components/LoadingSpinner
 */

export default function LoadingSpinner({ size = 'md', text = 'Chargement...', fullScreen = false }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-16 h-16 border-4',
    xl: 'w-24 h-24 border-4'
  }

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`${sizeClasses[size]} border-primary-500 border-t-transparent rounded-full animate-spin`}></div>
      {text && <p className="text-gray-600 dark:text-[rgb(var(--night-text-secondary))]">{text}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[rgb(var(--night-bg-start))]">
        {spinner}
      </div>
    )
  }

  return spinner
}

