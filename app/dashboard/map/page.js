'use client'

import dynamic from 'next/dynamic'
import { demoDevices } from '@/lib/demoData'

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

export default function MapPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
          <p className="text-gray-600 mt-1">Visualisation des appareils OTT (données de démonstration)</p>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <LeafletMap devices={demoDevices} />
      </div>
    </div>
  )
}
