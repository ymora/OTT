import { renderHook, act } from '@testing-library/react'
import { useFormState } from '@/hooks/useFormState'

describe('useFormState', () => {
  const initialState = {
    name: '',
    email: '',
    age: 0
  }

  it('devrait initialiser avec l\'état fourni', () => {
    const { result } = renderHook(() => useFormState(initialState))
    expect(result.current[0]).toEqual(initialState)
  })

  it('devrait gérer les changements de texte', () => {
    const { result } = renderHook(() => useFormState(initialState))
    
    act(() => {
      result.current[1]({
        target: { name: 'name', value: 'John Doe', type: 'text' }
      })
    })
    
    expect(result.current[0].name).toBe('John Doe')
  })

  it('devrait gérer les checkboxes', () => {
    const { result } = renderHook(() => useFormState({ agreed: false }))
    
    act(() => {
      result.current[1]({
        target: { name: 'agreed', checked: true, type: 'checkbox' }
      })
    })
    
    expect(result.current[0].agreed).toBe(true)
  })

  it('devrait réinitialiser l\'état', () => {
    const { result } = renderHook(() => useFormState(initialState))
    
    act(() => {
      result.current[1]({
        target: { name: 'name', value: 'John', type: 'text' }
      })
    })
    
    expect(result.current[0].name).toBe('John')
    
    act(() => {
      result.current[3]() // reset
    })
    
    expect(result.current[0]).toEqual(initialState)
  })

  it('devrait permettre de set directement les valeurs', () => {
    const { result } = renderHook(() => useFormState(initialState))
    
    const newValues = { name: 'Jane', email: 'jane@example.com', age: 25 }
    
    act(() => {
      result.current[2](newValues) // setValues
    })
    
    expect(result.current[0]).toEqual(newValues)
  })
})

