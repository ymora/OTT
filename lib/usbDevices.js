export const KNOWN_USB_DEVICES = [
  {
    usbVendorId: 0x1a86,
    usbProductId: 0x55d4,
    manufacturer: 'QinHeng/CH340',
    label: 'OTT Module (CH340 USB-Série)',
  },
]

const padHex = (value) => {
  if (value === undefined || value === null) return '????'
  return value.toString(16).padStart(4, '0')
}

export function getUsbRequestFilters() {
  return KNOWN_USB_DEVICES.map((device) => ({
    usbVendorId: device.usbVendorId,
    usbProductId: device.usbProductId,
  }))
}

export function getUsbDeviceLabel(info) {
  if (!info) return null
  const match = KNOWN_USB_DEVICES.find(
    (device) =>
      device.usbVendorId === info.usbVendorId &&
      (!device.usbProductId || device.usbProductId === info.usbProductId)
  )

  if (match) {
    return match.label
  }

  if (info.usbVendorId || info.usbProductId) {
    return `USB ${padHex(info.usbVendorId)}:${padHex(info.usbProductId)}`
  }

  return null
}

export function decorateUsbInfo(info) {
  if (!info) return null
  return {
    ...info,
    friendlyName: getUsbDeviceLabel(info),
    vendorHex: padHex(info.usbVendorId),
    productHex: padHex(info.usbProductId),
  }
}

