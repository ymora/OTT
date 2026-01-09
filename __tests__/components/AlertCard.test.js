/**
 * Tests pour le composant AlertCard
 */

import { render, screen } from '@testing-library/react'
import AlertCard from '../../components/AlertCard'

describe('AlertCard', () => {
  const mockAlert = {
    id: 1,
    message: 'Test alert message',
    severity: 'critical',
    created_at: '2025-01-15T10:00:00Z',
    device_name: 'Device 1',
    sim_iccid: '12345678901234567890',
    first_name: 'John',
    last_name: 'Doe'
  }

  it('devrait afficher le message de l\'alerte', () => {
    render(<AlertCard alert={mockAlert} />)
    expect(screen.getByText('Test alert message')).toBeInTheDocument()
  })

  it('devrait afficher la sévérité', () => {
    render(<AlertCard alert={mockAlert} />)
    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('devrait afficher les informations du dispositif', () => {
    render(<AlertCard alert={mockAlert} />)
    expect(screen.getByText(/Device 1/)).toBeInTheDocument()
    expect(screen.getByText(/12345678901234567890/)).toBeInTheDocument()
  })

  it('devrait afficher les informations du patient', () => {
    render(<AlertCard alert={mockAlert} />)
    expect(screen.getByText(/John Doe/)).toBeInTheDocument()
  })

  it('devrait utiliser les bonnes classes CSS pour la sévérité critical', () => {
    const { container } = render(<AlertCard alert={mockAlert} />)
    const card = container.firstChild
    expect(card.className).toContain('border-red-500')
    expect(card.className).toContain('bg-red-50')
  })

  it('devrait gérer les alertes sans dispositif', () => {
    const alertWithoutDevice = {
      ...mockAlert,
      device_name: null,
      sim_iccid: null
    }
    render(<AlertCard alert={alertWithoutDevice} />)
    expect(screen.getByText('Test alert message')).toBeInTheDocument()
  })
})

