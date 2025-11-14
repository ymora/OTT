'use client'

export default function AlertCard({ alert, delay = 0 }) {
  const severityConfig = {
    critical: { color: 'border-red-500 bg-red-50', icon: '🚨', textColor: 'text-red-700' },
    high: { color: 'border-orange-500 bg-orange-50', icon: '⚠️', textColor: 'text-orange-700' },
    medium: { color: 'border-yellow-500 bg-yellow-50', icon: '⚡', textColor: 'text-yellow-700' },
    low: { color: 'border-blue-500 bg-blue-50', icon: 'ℹ️', textColor: 'text-blue-700' },
  }

  const config = severityConfig[alert.severity] || severityConfig.low

  return (
    <div 
      className={`border-l-4 ${config.color} p-4 rounded-r-lg animate-slide-up hover:shadow-md transition-all`}
      style={{animationDelay: `${delay}s`}}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1">
          <p className={`font-semibold ${config.textColor}`}>{alert.message}</p>
          <p className="text-sm text-gray-600 mt-1">
            {new Date(alert.created_at).toLocaleString('fr-FR')}
          </p>
        </div>
        <span className={`badge ${config.textColor} bg-white`}>{alert.severity}</span>
      </div>
    </div>
  )
}

