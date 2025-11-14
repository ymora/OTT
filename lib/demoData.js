export const demoDevices = [
  {
    id: 1,
    device_name: 'OTT-Paris-001',
    sim_iccid: '893301230000000001',
    last_seen: '2025-11-14T09:20:00Z',
    last_battery: 82,
    status: 'online',
    latitude: 48.8566,
    longitude: 2.3522,
    city: 'Paris',
    firmware_version: '2.0.0',
    first_name: 'Pierre',
    last_name: 'Dupont'
  },
  {
    id: 2,
    device_name: 'OTT-Lyon-002',
    sim_iccid: '893301230000000002',
    last_seen: '2025-11-14T08:45:00Z',
    last_battery: 56,
    status: 'online',
    latitude: 45.7640,
    longitude: 4.8357,
    city: 'Lyon',
    firmware_version: '2.0.0',
    first_name: 'Paul',
    last_name: 'Martin'
  },
  {
    id: 3,
    device_name: 'OTT-Marseille-003',
    sim_iccid: '893301230000000003',
    last_seen: '2025-11-13T22:10:00Z',
    last_battery: 24,
    status: 'warning',
    latitude: 43.2965,
    longitude: 5.3698,
    city: 'Marseille',
    firmware_version: '1.9.5',
    first_name: 'Jacques',
    last_name: 'Bernard'
  },
  {
    id: 4,
    device_name: 'OTT-Lille-004',
    sim_iccid: '893301230000000004',
    last_seen: '2025-11-10T12:00:00Z',
    last_battery: 5,
    status: 'offline',
    latitude: 50.6292,
    longitude: 3.0573,
    city: 'Lille',
    firmware_version: '1.8.0',
    first_name: null,
    last_name: null
  }
]

export const demoPatients = [
  {
    id: 1,
    first_name: 'Pierre',
    last_name: 'Dupont',
    birth_date: '1982-03-14',
    phone: '+33611223344',
    device_count: 1
  },
  {
    id: 2,
    first_name: 'Paul',
    last_name: 'Martin',
    birth_date: '1975-08-02',
    phone: '+33655667788',
    device_count: 1
  },
  {
    id: 3,
    first_name: 'Jacques',
    last_name: 'Bernard',
    birth_date: '1990-12-21',
    phone: '+33777889900',
    device_count: 1
  }
]

export const demoUsers = [
  {
    id: 1,
    first_name: 'Yannick',
    last_name: 'Mora',
    email: 'ymora@free.fr',
    role_name: 'admin',
    is_active: true,
    last_login: '2025-11-14T06:30:00Z'
  },
  {
    id: 2,
    first_name: 'Maxime',
    last_name: 'Bertin',
    email: 'maxime@happlyzmedical.com',
    role_name: 'technicien',
    is_active: true,
    last_login: '2025-11-13T21:15:00Z'
  },
  {
    id: 3,
    first_name: 'Dr',
    last_name: 'Lefebvre',
    email: 'dr.lefebvre@clinic.fr',
    role_name: 'medecin',
    is_active: true,
    last_login: '2025-11-12T10:05:00Z'
  }
]

export const demoAlerts = [
  {
    id: 101,
    message: 'Batterie faible - OTT-Marseille-003',
    severity: 'critical',
    created_at: '2025-11-14T08:00:00Z',
    status: 'unresolved'
  },
  {
    id: 102,
    message: 'Perte de transmission - OTT-Lille-004',
    severity: 'high',
    created_at: '2025-11-13T21:45:00Z',
    status: 'unresolved'
  },
  {
    id: 103,
    message: 'OTA en attente - OTT-Paris-001',
    severity: 'medium',
    created_at: '2025-11-13T15:30:00Z',
    status: 'resolved'
  }
]

export const demoMeasurements = [
  { timestamp: '2025-11-14T09:00:00Z', flowrate: 2.3, last_battery: 82 },
  { timestamp: '2025-11-14T08:30:00Z', flowrate: 2.1, last_battery: 80 },
  { timestamp: '2025-11-14T08:00:00Z', flowrate: 2.2, last_battery: 78 },
  { timestamp: '2025-11-14T07:30:00Z', flowrate: 2.4, last_battery: 76 }
]

export const demoAuditLogs = [
  {
    id: 1,
    action: 'user.login',
    entity_type: 'user',
    entity_id: 1,
    email: 'ymora@free.fr',
    ip_address: '192.168.0.12',
    created_at: '2025-11-14T06:30:00Z'
  },
  {
    id: 2,
    action: 'device.config_updated',
    entity_type: 'device',
    entity_id: 2,
    email: 'maxime@happlyzmedical.com',
    ip_address: '192.168.0.45',
    created_at: '2025-11-13T22:15:00Z'
  }
]

export const demoFirmwares = [
  { id: 1, version: '2.0.0', file_size: 248832, is_stable: true, created_at: '2025-11-10T10:00:00Z' },
  { id: 2, version: '2.1.0-beta', file_size: 251904, is_stable: false, created_at: '2025-11-12T14:00:00Z' }
]

export const demoLogs = [
  {
    id: 1001,
    device_name: 'OTT-Paris-001',
    type: 'INFO',
    message: 'Transmission HTTP OK (250ms)',
    created_at: '2025-11-14T09:20:10Z'
  },
  {
    id: 1002,
    device_name: 'OTT-Lyon-002',
    type: 'WARN',
    message: 'RSSI faible (-101 dBm) - tentative de reconnection',
    created_at: '2025-11-14T08:46:02Z'
  },
  {
    id: 1003,
    device_name: 'OTT-Marseille-003',
    type: 'ERROR',
    message: 'Batterie < 20% - passage en mode économie',
    created_at: '2025-11-14T08:05:55Z'
  },
  {
    id: 1004,
    device_name: 'OTT-Lille-004',
    type: 'INFO',
    message: 'Deep sleep déclenché (aucun flux détecté)',
    created_at: '2025-11-10T12:05:00Z'
  }
]
