'use client'

import { useEffect, useState } from 'react'

export default function StatsCard({ title, value, icon, color = 'primary', delay = 0 }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    // Animation compteur
    const numericValue = parseInt(value) || 0
    let current = 0
    const increment = numericValue / 30
    const timer = setInterval(() => {
      current += increment
      if (current >= numericValue) {
        setDisplayValue(numericValue)
        clearInterval(timer)
      } else {
        setDisplayValue(Math.floor(current))
      }
    }, 20)

    return () => clearInterval(timer)
  }, [value])

  const colorClasses = {
    primary: 'from-primary-500 to-primary-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    blue: 'from-blue-500 to-blue-600',
    orange: 'from-orange-500 to-orange-600',
  }

  return (
    <div 
      className="card group hover:scale-105 cursor-pointer animate-slide-up"
      style={{animationDelay: `${delay}s`}}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted mb-1">{title}</p>
          <p className="text-3xl font-bold text-primary mb-2">
            {typeof value === 'string' && value.includes('%') ? value : displayValue}
          </p>
        </div>
        <div className={`w-14 h-14 bg-gradient-to-br ${colorClasses[color]} rounded-xl flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

