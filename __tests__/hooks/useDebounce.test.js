/**
 * Tests pour le hook useDebounce
 */

import { renderHook, act } from '@testing-library/react'
import { useDebounce } from '@/hooks/useDebounce'

jest.useFakeTimers()

describe('useDebounce', () => {
  it('devrait retourner la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebounce('test', 300))
    expect(result.current).toBe('test')
  })

  it('devrait debouncer les changements de valeur', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    )

    expect(result.current).toBe('initial')

    // Changer la valeur
    rerender({ value: 'updated', delay: 300 })
    
    // La valeur ne devrait pas changer immédiatement
    expect(result.current).toBe('initial')

    // Avancer le temps de 300ms
    act(() => {
      jest.advanceTimersByTime(300)
    })

    // Maintenant la valeur devrait être mise à jour
    expect(result.current).toBe('updated')
  })

  it('devrait utiliser le délai par défaut de 300ms', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })
    expect(result.current).toBe('initial')

    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(result.current).toBe('updated')
  })
})

