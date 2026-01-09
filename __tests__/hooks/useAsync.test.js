import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsync } from '@/hooks/useAsync'

describe('useAsync', () => {
  it('devrait initialiser avec loading=false, error=null, success=false', () => {
    const { result } = renderHook(() => useAsync())
    
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.success).toBe(false)
  })

  it('devrait gérer une opération asynchrone réussie', async () => {
    const { result } = renderHook(() => useAsync())
    
    const asyncFunc = jest.fn().mockResolvedValue('success')
    
    await act(async () => {
      await result.current.execute(asyncFunc)
    })
    
    expect(asyncFunc).toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.success).toBe(true)
  })

  it('devrait gérer une erreur', async () => {
    const { result } = renderHook(() => useAsync())
    
    const error = new Error('Test error')
    const asyncFunc = jest.fn().mockRejectedValue(error)
    
    await act(async () => {
      await expect(result.current.execute(asyncFunc)).rejects.toThrow('Test error')
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe('Test error')
    expect(result.current.success).toBe(false)
  })

  it('devrait définir loading=true pendant l\'exécution', async () => {
    const { result } = renderHook(() => useAsync())
    
    const asyncFunc = jest.fn(() => new Promise(resolve => setTimeout(resolve, 100)))
    
    act(() => {
      result.current.execute(asyncFunc)
    })
    
    expect(result.current.loading).toBe(true)
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('devrait reset l\'état', async () => {
    const { result } = renderHook(() => useAsync())
    
    const asyncFunc = jest.fn().mockResolvedValue('success')
    
    await act(async () => {
      await result.current.execute(asyncFunc)
    })
    
    expect(result.current.success).toBe(true)
    
    act(() => {
      result.current.reset()
    })
    
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(null)
    expect(result.current.success).toBe(false)
  })
})

