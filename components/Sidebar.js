'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const withBase = (path) => `${basePath}${path}`

const menuItems = [
  { name: 'Vue d\'Ensemble', icon: '🏠', path: '/dashboard', permission: null },
  { name: 'Dispositifs', icon: '🔌', path: '/dashboard/devices', permission: 'devices.view' },
  { name: 'Commandes', icon: '📡', path: '/dashboard/commands', permission: 'devices.commands' },
  { name: 'Patients', icon: '👥', path: '/dashboard/patients', permission: 'patients.view' },
  { name: 'Alertes', icon: '🔔', path: '/dashboard/alerts', permission: 'alerts.view' },
  { name: 'Carte', icon: '🗺️', path: '/dashboard/map', permission: null },
  { name: 'Historique', icon: '📋', path: '/dashboard/history', permission: null },
  { name: 'Journal', icon: '📝', path: '/dashboard/logs', permission: null },
  { name: 'Rapports', icon: '📊', path: '/dashboard/reports', permission: 'reports.view' },
  { name: 'Utilisateurs', icon: '👤', path: '/dashboard/users', permission: 'users.view' },
  { name: 'Notifications', icon: '📧', path: '/dashboard/notifications', permission: null },
  { name: 'OTA', icon: '🔄', path: '/dashboard/ota', permission: 'devices.ota' },
  { name: 'Audit', icon: '📜', path: '/dashboard/audit', permission: 'audit.view' },
  { name: 'Administration', icon: '🛠️', path: '/dashboard/admin', permission: 'settings.edit' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission)
  }

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {menuItems.map((item) => {
          if (!hasPermission(item.permission)) return null

          const isActive = pathname === item.path
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all
                ${isActive 
                  ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white shadow-lg scale-105' 
                  : 'text-gray-700 hover:bg-gray-100 hover:scale-102'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.name}</span>
              {isActive && (
                <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse"></div>
              )}
            </Link>
          )
        })}
      </nav>
      
      {/* Footer Sidebar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-50 to-transparent">
        <a 
          href={withBase('/DOCUMENTATION_COMPLETE_OTT.html')} 
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-all"
        >
          <span>📖</span>
          <span className="text-sm font-medium">Documentation</span>
        </a>
      </div>
    </aside>
  )
}

