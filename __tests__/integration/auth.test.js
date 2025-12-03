/**
 * Tests d'intégration pour l'authentification
 * Tests E2E pour les fonctionnalités critiques d'authentification
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthProvider } from '@/contexts/AuthContext'
import Login from '@/components/Login'

// Mock fetch global
global.fetch = jest.fn()

describe('Authentification E2E', () => {
  beforeEach(() => {
    // Reset fetch mock
    global.fetch.mockClear()
    // Clear localStorage
    localStorage.clear()
  })

  it('devrait permettre la connexion avec des identifiants valides', async () => {
    const mockToken = 'fake-jwt-token'
    const mockUser = { id: 1, email: 'test@example.com', role: 'admin' }

    // Mock réponse API de connexion réussie
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: mockToken,
        user: mockUser
      })
    })

    const onSuccess = jest.fn()

    render(
      <AuthProvider>
        <Login onSuccess={onSuccess} />
      </AuthProvider>
    )

    // Remplir le formulaire
    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/mot de passe/i)
    const submitButton = screen.getByRole('button', { name: /connexion/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    // Vérifier que l'API a été appelée
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api.php/auth/login'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.any(String)
        })
      )
    })

    // Vérifier que onSuccess a été appelé
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('devrait afficher une erreur avec des identifiants invalides', async () => {
    // Mock réponse API d'échec
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        message: 'Identifiants invalides'
      })
    })

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    )

    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/mot de passe/i)
    const submitButton = screen.getByRole('button', { name: /connexion/i })

    fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.click(submitButton)

    // Vérifier qu'un message d'erreur s'affiche
    await waitFor(() => {
      expect(screen.getByText(/identifiants invalides/i)).toBeInTheDocument()
    })
  })

  it('devrait gérer les erreurs réseau', async () => {
    // Mock erreur réseau
    global.fetch.mockRejectedValueOnce(new Error('Network error'))

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    )

    const emailInput = screen.getByPlaceholderText(/email/i)
    const passwordInput = screen.getByPlaceholderText(/mot de passe/i)
    const submitButton = screen.getByRole('button', { name: /connexion/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    // Vérifier qu'un message d'erreur réseau s'affiche
    await waitFor(() => {
      expect(screen.getByText(/erreur/i)).toBeInTheDocument()
    })
  })

  it('devrait valider le format email', async () => {
    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    )

    const emailInput = screen.getByPlaceholderText(/email/i)
    const submitButton = screen.getByRole('button', { name: /connexion/i })

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.click(submitButton)

    // Vérifier la validation HTML5 ou message d'erreur custom
    await waitFor(() => {
      expect(emailInput).toBeInvalid()
    })
  })
})

