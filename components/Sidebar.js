'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const withBase = (path) => `${basePath}${path}`

const menuStructure = [
  {
    type: 'single',
    name: 'Vue d\'Ensemble',
    icon: '🏠',
    path: '/dashboard',
    permission: null
  },
  {
    type: 'group',
    name: 'Dispositifs',
    icon: '🔌',
    items: [
      { name: 'Liste', path: '/dashboard/devices', permission: 'devices.view' },
      { name: 'Carte', path: '/dashboard/map', permission: null },
      { name: 'Commandes', path: '/dashboard/commands', permission: 'devices.commands' },
      { name: 'Historique', path: '/dashboard/history', permission: null },
      { name: 'Journal', path: '/dashboard/logs', permission: null },
      { name: 'OTA', path: '/dashboard/ota', permission: 'devices.ota' },
    ]
  },
  {
    type: 'group',
    name: 'Patients & Alertes',
    icon: '👥',
    items: [
      { name: 'Patients', path: '/dashboard/patients', permission: 'patients.view' },
      { name: 'Alertes', path: '/dashboard/alerts', permission: 'alerts.view' },
    ]
  },
  {
    type: 'single',
    name: 'Rapports',
    icon: '📊',
    path: '/dashboard/reports',
    permission: 'reports.view'
  },
  {
    type: 'group',
    name: 'Administration',
    icon: '🛠️',
    items: [
      { name: 'Utilisateurs', path: '/dashboard/users', permission: 'users.view' },
      { name: 'Notifications', path: '/dashboard/notifications', permission: null },
      { name: 'Audit', path: '/dashboard/audit', permission: 'audit.view' },
      { name: 'Paramètres', path: '/dashboard/admin', permission: 'settings.edit' },
    ]
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [expandedGroups, setExpandedGroups] = useState([])

  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission)
  }

  // Auto-expand groups that contain the current page
  useEffect(() => {
    const groups = []
    menuStructure.forEach((item, idx) => {
      if (item.type === 'group') {
        const hasActive = item.items.some(subItem => pathname === subItem.path)
        if (hasActive) groups.push(idx)
      }
    })
    setExpandedGroups(groups)
  }, [pathname])

  const toggleGroup = (idx) => {
    setExpandedGroups(prev => 
      prev.includes(idx) 
        ? prev.filter(i => i !== idx)
        : [...prev, idx]
    )
  }

  const hasAnyPermission = (items) => {
    return items.some(item => hasPermission(item.permission))
  }

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-white border-r border-gray-200 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {menuStructure.map((item, idx) => {
          if (item.type === 'single') {
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
          }

          if (item.type === 'group') {
            if (!hasAnyPermission(item.items)) return null
            
            const isExpanded = expandedGroups.includes(idx)
            const hasActiveChild = item.items.some(subItem => 
              hasPermission(subItem.permission) && pathname === subItem.path
            )

            return (
              <div key={item.name} className="space-y-1">
                <button
                  onClick={() => toggleGroup(idx)}
                  className={`
                    w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg font-medium transition-all
                    ${hasActiveChild
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    ▶
                  </span>
                </button>
                
                {isExpanded && (
                  <div className="ml-4 space-y-1 border-l-2 border-gray-200 pl-2">
                    {item.items.map((subItem) => {
                      if (!hasPermission(subItem.permission)) return null
                      const isActive = pathname === subItem.path
                      
                      return (
                        <Link
                          key={subItem.path}
                          href={subItem.path}
                          className={`
                            flex items-center gap-2 px-3 py-2 rounded text-sm transition-all
                            ${isActive
                              ? 'bg-primary-100 text-primary-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50'
                            }
                          `}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50"></span>
                          <span>{subItem.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return null
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

