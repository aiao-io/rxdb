import { describe, expect, it, vi } from 'vitest';
import { resolveCompareRemoteSchema } from '../../sql/compare-remote';
import type { SqlSchema } from '../../sql/types';

const REMOTE: SqlSchema = {
  tables: [
    {
      name: 'users',
      columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
      foreignKeys: [],
      indexes: []
    }
  ]
};

describe('resolveCompareRemoteSchema', () => {
  it('override 优先，不触发拉取', async () => {
    const fetchRemoteSchema = vi.fn();
    const result = await resolveCompareRemoteSchema({ override: REMOTE, fetchRemoteSchema, cached: null });

    expect(result).toEqual({ status: 'ok', remote: REMOTE });
    expect(fetchRemoteSchema).not.toHaveBeenCalled();
  });

  it('无 override 时拉取远程 schema', async () => {
    const fetchRemoteSchema = vi.fn().mockResolvedValue(REMOTE);
    const result = await resolveCompareRemoteSchema({ fetchRemoteSchema, cached: null });

    expect(result).toEqual({ status: 'ok', remote: REMOTE });
    expect(fetchRemoteSchema).toHaveBeenCalledTimes(1);
  });

  it('拉取失败时返回 error，不退化成与空 schema 对比', async () => {
    const fetchRemoteSchema = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await resolveCompareRemoteSchema({ fetchRemoteSchema, cached: null });

    expect(result).toEqual({ status: 'error', message: 'boom' });
  });

  it('拉取失败但有缓存时用缓存并标记 stale', async () => {
    const fetchRemoteSchema = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await resolveCompareRemoteSchema({ fetchRemoteSchema, cached: REMOTE });

    expect(result).toEqual({ status: 'stale', remote: REMOTE, message: 'offline' });
  });

  it('无 adapter 且无缓存时明确返回 unavailable', async () => {
    const result = await resolveCompareRemoteSchema({ cached: null });

    expect(result).toEqual({ status: 'unavailable', remote: { tables: [] } });
  });

  it('无 adapter 但有缓存时用缓存', async () => {
    const result = await resolveCompareRemoteSchema({ cached: REMOTE });

    expect(result).toEqual({ status: 'ok', remote: REMOTE });
  });

  it('远程返回 null 视为空 schema（远端尚无表）', async () => {
    const result = await resolveCompareRemoteSchema({ fetchRemoteSchema: async () => null, cached: null });

    expect(result).toEqual({ status: 'ok', remote: { tables: [] } });
  });
});
