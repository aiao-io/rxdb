import { vi } from 'vitest';
import { loadObjectUrlMap } from './loadObjectUrlMap';

describe('loadObjectUrlMap', () => {
  it('loads URLs by key', async () => {
    const result = await loadObjectUrlMap({
      items: ['a', 'b'],
      getKey: item => item,
      loadUrl: async item => `blob:${item}`,
      isCurrent: () => true,
      revokeUrl: vi.fn()
    });

    expect([...result]).toEqual([
      ['a', 'blob:a'],
      ['b', 'blob:b']
    ]);
  });

  it('revokes URLs created after the request is cancelled', async () => {
    const revokeUrl = vi.fn();
    const result = await loadObjectUrlMap({
      items: ['stale'],
      getKey: item => item,
      loadUrl: async () => 'blob:stale',
      isCurrent: () => false,
      revokeUrl
    });

    expect(result.size).toBe(0);
    expect(revokeUrl).toHaveBeenCalledWith('blob:stale');
  });
});
