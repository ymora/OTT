'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700">
          Page non trouvée
        </h2>
        <p className="text-gray-600">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
        </p>
        <div className="flex items-center justify-center gap-3 pt-4">
          <Link
            href="/"
            className="px-4 py-2 rounded-md bg-primary text-white shadow-sm hover:bg-primary-dark transition-colors"
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  )
}

