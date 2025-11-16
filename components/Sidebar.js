'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const withBase = (path) => `${basePath}${path}`

// Menu plat simplifié - toutes les fonctionnalités accessibles directement
// Pattern cohérent : chaque page contient carte (si pertinent) + tableau + actions
const menuStructure = [
  {
    name: 'Vue d\'Ensemble',
    icon: '🏠',
    path: '/dashboard',
    permission: null
  },
  {
    name: 'Dispositifs',
    icon: '🔌',
    path: '/dashboard/devices',
    permission: 'devices.view',
    description: 'Carte + Tableau avec actions intégrées'
  },
  {
    name: 'Patients',
    icon: '👥',
    path: '/dashboard/patients',
    permission: 'patients.view',
    description: 'Gestion des patients'
  },
  {
    name: 'Alertes',
    icon: '🔔',
    path: '/dashboard/alerts',
    permission: 'alerts.view',
    description: 'Surveillance et alertes'
  },
  {
    name: 'Commandes',
    icon: '📡',
    path: '/dashboard/commands',
    permission: 'devices.commands',
    description: 'Commandes dispositifs'
  },
  {
    name: 'Utilisateurs',
    icon: '👤',
    path: '/dashboard/users',
    permission: 'users.view',
    description: 'Gestion des utilisateurs'
  },
  {
    name: 'Audit',
    icon: '📜',
    path: '/dashboard/audit',
    permission: 'audit.view',
    description: 'Logs d\'audit'
  },
  {
    name: 'OTA',
    icon: '🔄',
    path: '/dashboard/ota',
    permission: 'devices.edit',
    description: 'Gestion des firmwares et mises à jour OTA'
  },
  {
    name: 'Notifications',
    icon: '📧',
    path: '/dashboard/notifications',
    permission: 'users.view',
    description: 'Queue des notifications et tests'
  },
  {
    name: 'Diagnostics',
    icon: '🔍',
    path: '/diagnostics',
    permission: 'settings.edit',
    description: 'Statut API et base de données'
  },
  {
    name: 'Paramètres',
    icon: '⚙️',
    path: '/dashboard/admin',
    permission: 'settings.edit',
    description: 'Configuration système'
  },
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
        {menuStructure.map((item) => {
          if (!hasPermission(item.permission)) return null
          const isActive = pathname === item.path || pathname.startsWith(item.path + '/')
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all group
                ${isActive 
                  ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white shadow-lg scale-105' 
                  : 'text-gray-700 hover:bg-gray-100 hover:scale-102'
                }
              `}
              title={item.description}
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

