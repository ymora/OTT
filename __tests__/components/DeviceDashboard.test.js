/**
 * Tests pour le composant DeviceDashboard
 * 
 * Ces tests vérifient que le composant DeviceDashboard fonctionne correctement
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeviceDashboard } from '@/components/DeviceDashboard'
import { UsbContext } from '@/contexts/UsbContext'

// Mock du contexte USB
const mockUsbContext = {
  isConnected: false,
  isSupported: true,
  usbStreamStatus: 'disconnected',
  usbStreamLogs: [],
  remoteLogs: [],
  isStreamingRemote: false,
  port: null,
  requestPort: jest.fn(),
  connect: jest.fn(),
  startUsbStreaming: jest.fn(),
  pauseUsbStreaming: jest.fn(),
  appendUsbStreamLog: jest.fn(),
  clearUsbStreamLogs: jest.fn()
}

// Mock des données de test
const mockDevices = [
  {
    id: 'device1',
    device_identifier: 'ESP32-001',
    device_name: 'Device Test 1',
    device_type: 'ESP32',
    status: 'online',
    last_seen: '2024-01-06T23:00:00Z',
    firmware_version: '1.0.0',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 'device2',
    device_identifier: 'ESP32-002',
    device_name: 'Device Test 2',
    device_type: 'ESP32',
    status: 'offline',
    last_seen: '2024-01-05T23:00:00Z',
    firmware_version: '1.0.0',
    created_at: '2024-01-01T00:00:00Z'
  }
]

describe('DeviceDashboard', () => {
  const renderComponent = (props = {}) => {
    return render(
      <UsbContext.Provider value={mockUsbContext}>
        <DeviceDashboard 
          devices={mockDevices}
          isLoading={false}
          error={null}
          onRefresh={jest.fn()}
          onCreateDevice={jest.fn()}
          onUpdateDevice={jest.fn()}
          onDeleteDevice={jest.fn()}
          {...props}
        />
      </UsbContext.Provider>
    )
  }

  it('devrait afficher la liste des dispositifs', () => {
    renderComponent()
    
    expect(screen.getByText('Device Test 1')).toBeInTheDocument()
    expect(screen.getByText('Device Test 2')).toBeInTheDocument()
    expect(screen.getByText('ESP32-001')).toBeInTheDocument()
    expect(screen.getByText('ESP32-002')).toBeInTheDocument()
  })

  it('devrait afficher l\'état de connexion USB', () => {
    renderComponent()
    
    expect(screen.getByText('USB: Non connecté')).toBeInTheDocument()
  })

  it('devrait afficher le bouton de rafraîchissement', () => {
    const onRefresh = jest.fn()
    renderComponent({ onRefresh })
    
    const refreshButton = screen.getByRole('button', { name: /rafraîchir/i })
    expect(refreshButton).toBeInTheDocument()
    
    fireEvent.click(refreshButton)
    expect(onRefresh).toHaveBeenCalled()
  })

  it('devrait afficher le bouton de création de dispositif', () => {
    const onCreateDevice = jest.fn()
    renderComponent({ onCreateDevice })
    
    const createButton = screen.getByRole('button', { name: /créer/i })
    expect(createButton).toBeInTheDocument()
    
    fireEvent.click(createButton)
    expect(onCreateDevice).toHaveBeenCalled()
  })

  it('devrait afficher un état de chargement', () => {
    renderComponent({ isLoading: true })
    
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('devrait afficher une erreur', () => {
    const errorMessage = 'Erreur de connexion'
    renderComponent({ error: errorMessage })
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument()
  })

  it('devrait filtrer les dispositifs par statut', () => {
    renderComponent()
    
    const statusFilter = screen.getByRole('combobox', { name: /statut/i })
    expect(statusFilter).toBeInTheDocument()
    
    // Filtrer les dispositifs en ligne
    fireEvent.change(statusFilter, { target: { value: 'online' } })
    
    // Vérifier que seul le dispositif en ligne est affiché
    expect(screen.getByText('Device Test 1')).toBeInTheDocument()
    expect(screen.queryByText('Device Test 2')).not.toBeInTheDocument()
  })

  it('devrait rechercher des dispositifs', () => {
    renderComponent()
    
    const searchInput = screen.getByPlaceholderText(/rechercher/i)
    expect(searchInput).toBeInTheDocument()
    
    // Rechercher un dispositif spécifique
    fireEvent.change(searchInput, { target: { value: 'ESP32-001' } })
    
    // Vérifier que seul le dispositif correspondant est affiché
    expect(screen.getByText('ESP32-001')).toBeInTheDocument()
    expect(screen.queryByText('ESP32-002')).not.toBeInTheDocument()
  })

  it('devrait afficher les détails d\'un dispositif', async () => {
    renderComponent()
    
    // Cliquer sur un dispositif pour voir les détails
    const deviceCard = screen.getByText('Device Test 1')
    fireEvent.click(deviceCard)
    
    await waitFor(() => {
      expect(screen.getByText('Détails du dispositif')).toBeInTheDocument()
      expect(screen.getByText('ESP32-001')).toBeInTheDocument()
      expect(screen.getByText('1.0.0')).toBeInTheDocument()
    })
  })

  it('devrait permettre de mettre à jour un dispositif', async () => {
    const onUpdateDevice = jest.fn()
    renderComponent({ onUpdateDevice })
    
    // Cliquer sur un dispositif puis sur le bouton de modification
    const deviceCard = screen.getByText('Device Test 1')
    fireEvent.click(deviceCard)
    
    await waitFor(() => {
      const editButton = screen.getByRole('button', { name: /modifier/i })
      fireEvent.click(editButton)
    })
    
    await waitFor(() => {
      expect(screen.getByText('Modifier le dispositif')).toBeInTheDocument()
      
      const saveButton = screen.getByRole('button', { name: /enregistrer/i })
      fireEvent.click(saveButton)
      
      expect(onUpdateDevice).toHaveBeenCalled()
    })
  })

  it('devrait permettre de supprimer un dispositif', async () => {
    const onDeleteDevice = jest.fn()
    renderComponent({ onDeleteDevice })
    
    // Cliquer sur un dispositif puis sur le bouton de suppression
    const deviceCard = screen.getByText('Device Test 1')
    fireEvent.click(deviceCard)
    
    await waitFor(() => {
      const deleteButton = screen.getByRole('button', { name: /supprimer/i })
      fireEvent.click(deleteButton)
    })
    
    await waitFor(() => {
      expect(screen.getByText('Confirmer la suppression')).toBeInTheDocument()
      
      const confirmButton = screen.getByRole('button', { name: /supprimer/i })
      fireEvent.click(confirmButton)
      
      expect(onDeleteDevice).toHaveBeenCalledWith('device1')
    })
  })

  it('devrait afficher les statistiques des dispositifs', () => {
    renderComponent()
    
    expect(screen.getByText(/dispositifs totaux/i)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/en ligne/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/hors ligne/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('devrait gérer la connexion USB', () => {
    const mockConnect = jest.fn()
    renderComponent({}, {
      UsbContext: {
        ...mockUsbContext,
        connect: mockConnect
      }
    })
    
    const connectButton = screen.getByRole('button', { name: /connecter usb/i })
    fireEvent.click(connectButton)
    
    expect(mockConnect).toHaveBeenCalled()
  })

  it('devrait afficher les logs USB quand connecté', () => {
    const mockLogs = [
      { timestamp: '2024-01-06T23:00:00Z', level: 'info', message: 'Device connected' },
      { timestamp: '2024-01-06T23:01:00Z', level: 'error', message: 'Connection lost' }
    ]
    
    renderComponent({}, {
      UsbContext: {
        ...mockUsbContext,
        isConnected: true,
        usbStreamLogs: mockLogs
      }
    })
    
    expect(screen.getByText('Device connected')).toBeInTheDocument()
    expect(screen.getByText('Connection lost')).toBeInTheDocument()
  })
})
