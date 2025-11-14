'use client'

export default function MapPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
      <div className="card">
        <div className="h-[600px] flex items-center justify-center bg-gray-100 rounded-lg">
          <div className="text-center">
            <p className="text-6xl mb-4">🗺️</p>
            <p className="text-gray-600">Carte Leaflet React à intégrer</p>
            <p className="text-sm text-gray-500 mt-2">npm install react-leaflet leaflet</p>
          </div>
        </div>
      </div>
    </div>
  )
}

