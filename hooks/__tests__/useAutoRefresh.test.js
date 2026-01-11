import { renderHook } from '@testing-library/react';
import { useAutoRefresh } from '../useAutoRefresh';

describe('useAutoRefresh', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useAutoRefresh());
    expect(result.current.isRefreshing).toBe(false);
  });
});
