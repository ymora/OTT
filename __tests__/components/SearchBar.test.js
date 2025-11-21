/**
 * Tests pour le composant SearchBar
 */

import { render, screen, fireEvent } from '@testing-library/react'
import SearchBar from '@/components/SearchBar'

describe('SearchBar', () => {
  it('devrait rendre un input avec le placeholder', () => {
    const placeholder = 'Rechercher...'
    render(<SearchBar value="" onChange={() => {}} placeholder={placeholder} />)
    
    const input = screen.getByPlaceholderText(placeholder)
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('devrait afficher la valeur initiale', () => {
    const value = 'test search'
    render(<SearchBar value={value} onChange={() => {}} />)
    
    const input = screen.getByDisplayValue(value)
    expect(input).toBeInTheDocument()
  })

  it('devrait appeler onChange quand la valeur change', () => {
    const handleChange = jest.fn()
    render(<SearchBar value="" onChange={handleChange} />)
    
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new value' } })
    
    expect(handleChange).toHaveBeenCalledWith('new value')
  })

  it('devrait appliquer la className personnalisée', () => {
    const customClass = 'custom-class'
    render(<SearchBar value="" onChange={() => {}} className={customClass} />)
    
    const input = screen.getByRole('textbox')
    expect(input.className).toContain(customClass)
  })
})

