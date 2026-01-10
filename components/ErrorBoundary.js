'use client'

import React from 'react'
import { logger } from '@/lib/logger'

/**
 * Composant ErrorBoundary pour capturer les erreurs React
 * Affiche un message d'erreur convivial au lieu de faire planter toute l'application
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Mettre à jour l'état pour que le prochain rendu affiche l'UI de fallback
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Logger l'erreur pour le debugging
    logger.error('ErrorBoundary caught an error:', {
      error,
      errorInfo,
      componentStack: errorInfo?.componentStack
    })
    
    this.setState({
      error,
      errorInfo
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      // UI de fallback personnalisée
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      // UI de fallback par défaut
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-3xl font-semibold text-gray-900">
              Oups, une erreur est survenue
            </h1>
            <p className="text-gray-600">
              L&apos;application a rencontré un problème. Vous pouvez réessayer ou revenir à l&apos;accueil.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left bg-red-50 p-4 rounded border border-red-200">
                <summary className="cursor-pointer font-medium text-red-800">
                  Détails de l&apos;erreur (développement)
                </summary>
                <pre className="mt-2 text-xs text-red-700 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-md bg-primary text-white shadow-sm hover:bg-primary-dark transition-colors"
                aria-label="Réessayer"
              >
                Réessayer
              </button>
              <a
                href="/"
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Accueil
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

