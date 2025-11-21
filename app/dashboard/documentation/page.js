'use client'

import { useEffect } from 'react'
import { withBasePath } from '@/lib/utils'

export default function DocumentationPage() {
  useEffect(() => {
    // S'assurer que le contenu est chargé dans la PWA
    document.title = 'Documentation - OTT Dashboard'
  }, [])

  const docUrl = withBasePath('/DOCUMENTATION_PRESENTATION.html')

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

