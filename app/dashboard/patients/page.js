'use client'

import { useEffect, useState } from 'react'
import { demoPatients } from '@/lib/demoData'

export default function PatientsPage() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    // ⚠️ MODE DÉMO - Appels API désactivés
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      setPatients(demoPatients)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">👥 Patients</h1>
        <button className="btn-primary">➕ Nouveau Patient</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="animate-shimmer h-96"></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Date Naissance</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Dispositifs</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50 animate-slide-up" style={{animationDelay: `${i * 0.05}s`}}>
                    <td className="py-3 px-4 font-medium">{p.first_name} {p.last_name}</td>
                    <td className="py-3 px-4">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td className="py-3 px-4">{p.phone || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="badge badge-success">{p.device_count || 0}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button className="btn-secondary text-sm">👁️ Détails</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

