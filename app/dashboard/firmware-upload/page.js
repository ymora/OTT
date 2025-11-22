'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Redirection vers la nouvelle page Configuration
 * Cette page est conservée pour la compatibilité avec les anciens liens
 */
export default function FirmwareUploadPage() {
  const router = useRouter()

  useEffect(() => {
    // Rediriger vers la nouvelle page Configuration
    router.replace('/dashboard/configuration')
  }, [router])

  return (
    <div className="p-6">
      <p className="text-gray-600 dark:text-gray-400">Redirection vers la page Configuration...</p>
    </div>
  )
}
