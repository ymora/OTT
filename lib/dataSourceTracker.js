/**
 * Système de tracking de la source des données pour les dispositifs
 * Permet de savoir si une donnée vient de USB (temps réel) ou de la base de données
 */

/**
 * Crée un tracker de source pour un dispositif
 * @param {Object} device - Dispositif depuis la base de données
 * @param {Object} usbDevice - Dispositif USB connecté (si applicable)
 * @param {Object} usbStreamData - Données du stream USB en temps réel
 * @returns {Object} Tracker avec les sources pour chaque colonne
 */
export function createDataSourceTracker(device, usbDevice, usbStreamData = null) {
  const isUsbConnected = usbDevice && (
    usbDevice.id === device.id ||
    usbDevice.sim_iccid === device.sim_iccid ||
    usbDevice.device_serial === device.device_serial
  )

  // Dernière mesure USB reçue
  const lastUsbMeasurement = usbStreamData?.lastMeasurement || null

  return {
    // Batterie : USB si disponible en temps réel, sinon DB
    battery: {
      value: isUsbConnected && lastUsbMeasurement?.battery_percent !== undefined
        ? lastUsbMeasurement.battery_percent
        : device.last_battery,
      source: isUsbConnected && lastUsbMeasurement?.battery_percent !== undefined ? 'usb' : 'db',
      timestamp: isUsbConnected && lastUsbMeasurement?.battery_percent !== undefined
        ? lastUsbMeasurement.timestamp
        : device.updated_at
    },

    // Débit : USB si disponible, sinon DB
    flowrate: {
      value: isUsbConnected && lastUsbMeasurement?.flow_lpm !== undefined
        ? lastUsbMeasurement.flow_lpm
        : device.last_flowrate,
      source: isUsbConnected && lastUsbMeasurement?.flow_lpm !== undefined ? 'usb' : 'db',
      timestamp: isUsbConnected && lastUsbMeasurement?.flow_lpm !== undefined
        ? lastUsbMeasurement.timestamp
        : device.updated_at
    },

    // RSSI : USB si disponible, sinon DB
    rssi: {
      value: isUsbConnected && lastUsbMeasurement?.rssi !== undefined
        ? lastUsbMeasurement.rssi
        : device.last_rssi,
      source: isUsbConnected && lastUsbMeasurement?.rssi !== undefined ? 'usb' : 'db',
      timestamp: isUsbConnected && lastUsbMeasurement?.rssi !== undefined
        ? lastUsbMeasurement.timestamp
        : device.updated_at
    },

    // Firmware : USB si disponible, sinon DB
    firmware: {
      value: isUsbConnected && usbDevice?.firmware_version
        ? usbDevice.firmware_version
        : device.firmware_version,
      source: isUsbConnected && usbDevice?.firmware_version ? 'usb' : 'db',
      timestamp: isUsbConnected && usbDevice?.firmware_version
        ? usbDevice.last_seen
        : device.updated_at
    },

    // Statut : USB si connecté, sinon DB
    status: {
      value: isUsbConnected ? 'usb_connected' : device.status,
      source: isUsbConnected ? 'usb' : 'db',
      timestamp: isUsbConnected ? new Date().toISOString() : device.last_seen
    },

    // Dernier contact : USB si connecté, sinon DB
    lastSeen: {
      value: isUsbConnected ? new Date().toISOString() : device.last_seen,
      source: isUsbConnected ? 'usb' : 'db',
      timestamp: isUsbConnected ? new Date().toISOString() : device.last_seen
    },

    // ICCID : Toujours DB (identifiant unique)
    iccid: {
      value: device.sim_iccid,
      source: 'db',
      timestamp: device.created_at
    },

    // Serial : USB si disponible, sinon DB
    serial: {
      value: isUsbConnected && usbDevice?.device_serial
        ? usbDevice.device_serial
        : device.device_serial,
      source: isUsbConnected && usbDevice?.device_serial ? 'usb' : 'db',
      timestamp: isUsbConnected && usbDevice?.device_serial
        ? usbDevice.last_seen
        : device.updated_at
    }
  }
}

/**
 * Obtient l'icône et la couleur pour une source de données
 * @param {string} source - 'usb' ou 'db'
 * @returns {Object} { icon, color, tooltip }
 */
export function getDataSourceBadge(source) {
  if (source === 'usb') {
    return {
      icon: '🔌',
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      tooltip: 'Donnée en temps réel depuis USB'
    }
  }
  return {
    icon: '💾',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    tooltip: 'Donnée depuis la base de données'
  }
}

/**
 * Composant d'indicateur de source (pour utilisation dans React)
 * @param {string} source - 'usb' ou 'db'
 * @param {string} className - Classes CSS additionnelles
 */
export function DataSourceIndicator({ source, className = '' }) {
  const badge = getDataSourceBadge(source)
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs ${badge.bgColor} ${badge.color} ${className}`}
      title={badge.tooltip}
    >
      {badge.icon}
    </span>
  )
}

