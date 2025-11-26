'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { withBasePath } from '@/lib/utils'

const DOCUMENTATION_FILES = {
  presentation: 'DOCUMENTATION_PRESENTATION.html',
  developpeurs: 'DOCUMENTATION_DEVELOPPEURS.html',
  commerciale: 'DOCUMENTATION_COMMERCIALE.html'
}

export default function DocumentationPage() {
  const searchParams = useSearchParams()
  const docType = searchParams.get('doc') || 'presentation'
  
  const docUrl = useMemo(() => {
    const fileName = DOCUMENTATION_FILES[docType] || DOCUMENTATION_FILES.presentation
    return withBasePath(`/docs/${fileName}`)
  }, [docType])

  useEffect(() => {
    // Mettre à jour le titre selon le type de documentation
    const titles = {
      presentation: 'Documentation Présentation - OTT Dashboard',
      developpeurs: 'Documentation Développeurs - OTT Dashboard',
      commerciale: 'Documentation Commerciale - OTT Dashboard'
    }
    document.title = titles[docType] || titles.presentation
  }, [docType])

  return (
    <div className="fixed inset-0 top-16 left-64 right-0 bottom-0 -m-6">
      <iframe
        src={docUrl}
        className="w-full h-full border-0"
        title="Documentation OTT"
        allow="fullscreen"
      />
    </div>
  )
}

