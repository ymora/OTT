import { renderHook, act } from '@testing-library/react';
import { useToggle } from '../useToggle';

describe('useToggle', () => {
  it('should initialize with false', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current[0]).toBe(false);
  });

  it('should toggle value', () => {
    const { result } = renderHook(() => useToggle(false));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
  });
});
