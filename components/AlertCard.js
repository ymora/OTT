import PropTypes from 'prop-types'
import { ALERT_COLORS } from '@/lib/config'

export default function AlertCard({ alert = {} }) {
  const severity = (alert.severity || 'low').toLowerCase()
  const colors = ALERT_COLORS[severity] || ALERT_COLORS.low
  const patientName = [alert.first_name, alert.last_name].filter(Boolean).join(' ')
  const deviceInfo = alert.device_name || alert.sim_iccid || 'Dispositif inconnu'

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm grid gap-2 ${colors.border} ${colors.bg}`}
      data-testid="alert-card"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {alert.message || 'Alerte sans message'}
        </p>
        <span className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-300">
          {alert.severity || 'low'}
        </span>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        {new Date(alert.created_at || Date.now()).toLocaleString('fr-FR')}
      </p>
      <div className="text-sm text-gray-800 dark:text-gray-200">
        <p className="font-medium">{deviceInfo}</p>
        {alert.sim_iccid && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{alert.sim_iccid}</p>
        )}
      </div>
      {patientName && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{patientName}</p>
      )}
    </div>
  )
}

AlertCard.propTypes = {
  alert: PropTypes.shape({
    message: PropTypes.string,
    severity: PropTypes.string,
    created_at: PropTypes.string,
    device_name: PropTypes.string,
    sim_iccid: PropTypes.string,
    first_name: PropTypes.string,
    last_name: PropTypes.string,
  }),
}
