import { describe, expect, it, vi } from 'vitest';
import { seedAndRefreshRecords } from './search-seed-refresh';

describe('seedAndRefreshRecords', () => {
  it('refreshes record snapshots after seed completes', async () => {
    const seed = vi.fn().mockResolvedValue({ article: 3, comment: 4 });
    const refresh = vi.fn().mockResolvedValue(undefined);

    await seedAndRefreshRecords(seed, refresh);

    expect(seed).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(seed.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]);
  });

  it('does not refresh when a seed operation is already running', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);

    await seedAndRefreshRecords(() => Promise.resolve(null), refresh);

    expect(refresh).not.toHaveBeenCalled();
  });
});
