import { renderHook, act } from '@testing-library/react'
import { useToggle } from '@/hooks/useToggle'

describe('useToggle', () => {
  it('devrait initialiser avec false par défaut', () => {
    const { result } = renderHook(() => useToggle())
    expect(result.current[0]).toBe(false)
  })

  it('devrait initialiser avec la valeur fournie', () => {
    const { result } = renderHook(() => useToggle(true))
    expect(result.current[0]).toBe(true)
  })

  it('devrait toggle la valeur', () => {
    const { result } = renderHook(() => useToggle(false))
    
    act(() => {
      result.current[1]() // toggle est une fonction, pas un objet
    })
    
    expect(result.current[0]).toBe(true)
    
    act(() => {
      result.current[1]() // toggle
    })
    
    expect(result.current[0]).toBe(false)
  })

  it('devrait ouvrir (set true)', () => {
    const { result } = renderHook(() => useToggle(false))
    
    act(() => {
      result.current[2]() // setTrue est à l'index 2
    })
    
    expect(result.current[0]).toBe(true)
  })

  it('devrait fermer (set false)', () => {
    const { result } = renderHook(() => useToggle(true))
    
    act(() => {
      result.current[3]() // setFalse est à l'index 3
    })
    
    expect(result.current[0]).toBe(false)
  })

  it('devrait définir une valeur spécifique', () => {
    const { result } = renderHook(() => useToggle(false))
    
    act(() => {
      result.current[2]() // setTrue
    })
    
    expect(result.current[0]).toBe(true)
    
    act(() => {
      result.current[3]() // setFalse
    })
    
    expect(result.current[0]).toBe(false)
  })
})

