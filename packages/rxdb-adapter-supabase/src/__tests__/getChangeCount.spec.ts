/**
 * @fileoverview getChangeCount 集成测试
 *
 * 测试 RxDBAdapterSupabase.getChangeCount() 方法：
 * - 返回值结构 { count: number, latestChangeId: number }
 * - sinceId=maxInt 时返回 count=0, latestChangeId=sinceId
 * - repositoryFilter 过滤生效
 * - branchId 过滤生效
 * - 有新变更时 latestChangeId > sinceId
 *
 * 需要可用的 Supabase 测试环境；缺失配置时测试直接失败。
 * VITE_SUPABASE_URL / VITE_SUPABASE_KEY
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

describe('getChangeCount (Supabase 集成)', () => {
  let adapter: RxDBAdapterSupabase;

  beforeAll(async () => {
    const rxdb = new RxDB({
      context: { userId: TEST_USER_ID },
      dbName: `test-change-count-${Date.now()}`,
      entities: [Todo],
      sync: {
        remote: { adapter: 'supabase' },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
  });

  // ============================================
  // 基础验证
  // ============================================

  describe('方法存在性', () => {
    it('getChangeCount 方法应该存在', () => {
      expect(typeof adapter.getChangeCount).toBe('function');
    });
  });

  // ============================================
  // 返回值结构
  // ============================================

  describe('返回值结构', () => {
    it('应该返回 { count, latestChangeId } 对象', async () => {
      const result = await adapter.getChangeCount(0);
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('latestChangeId');
    });

    it('count 应该是非负整数', async () => {
      const { count } = await adapter.getChangeCount(0);
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(count)).toBe(true);
    });

    it('latestChangeId 应该是非负整数', async () => {
      const { latestChangeId } = await adapter.getChangeCount(0);
      expect(typeof latestChangeId).toBe('number');
      expect(latestChangeId).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(latestChangeId)).toBe(true);
    });
  });

  // ============================================
  // sinceId 边界行为
  // ============================================

  describe('sinceId 边界行为', () => {
    it('sinceId=maxInt 时 count 应该为 0', async () => {
      const maxInt = 2147483647; // PostgreSQL integer max
      const { count } = await adapter.getChangeCount(maxInt);
      expect(count).toBe(0);
    });

    it('sinceId=maxInt 时 latestChangeId 应等于 sinceId', async () => {
      const maxInt = 2147483647;
      const { latestChangeId } = await adapter.getChangeCount(maxInt);
      expect(latestChangeId).toBe(maxInt);
    });

    it('sinceId=0 时 latestChangeId >= 0', async () => {
      const { count, latestChangeId } = await adapter.getChangeCount(0);
      if (count === 0) {
        expect(latestChangeId).toBe(0);
      } else {
        expect(latestChangeId).toBeGreaterThan(0);
      }
    });
  });

  // ============================================
  // repositoryFilter 过滤
  // ============================================

  describe('repositoryFilter', () => {
    it('使用 repositoryFilter 时返回值结构不变', async () => {
      const result = await adapter.getChangeCount(0, ['Todo']);
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('latestChangeId');
      expect(typeof result.count).toBe('number');
      expect(typeof result.latestChangeId).toBe('number');
    });

    it('repositoryFilter 为空数组时与不传等效（count >= 0）', async () => {
      const resultA = await adapter.getChangeCount(0);
      const resultB = await adapter.getChangeCount(0, []);
      // 空数组不过滤，两次结果相同
      expect(resultB.count).toBe(resultA.count);
    });

    it('不存在的实体名称立即失败', async () => {
      await expect(adapter.getChangeCount(0, ['NonExistentEntity_XYZ_12345'])).rejects.toThrow(
        'Entity "NonExistentEntity_XYZ_12345" is not configured'
      );
    });

    it('不存在的实体不会静默推进水位线', async () => {
      await expect(adapter.getChangeCount(0, ['NonExistentEntity_XYZ_12345'])).rejects.toThrow(
        'Entity "NonExistentEntity_XYZ_12345" is not configured'
      );
    });
  });

  // ============================================
  // branchId 过滤
  // ============================================

  describe('branchId 过滤', () => {
    it('使用 branchId 时返回值结构不变', async () => {
      const result = await adapter.getChangeCount(0, undefined, 'main');
      expect(result).toHaveProperty('count');
      expect(result).toHaveProperty('latestChangeId');
    });

    it('不存在的 branchId 时 count 为 0', async () => {
      const { count } = await adapter.getChangeCount(0, undefined, 'branch-does-not-exist-xyz-12345');
      expect(count).toBe(0);
    });

    it('不存在的 branchId 时 latestChangeId 等于 sinceId', async () => {
      const sinceId = 0;
      const { latestChangeId } = await adapter.getChangeCount(sinceId, undefined, 'branch-does-not-exist-xyz-12345');
      expect(latestChangeId).toBe(sinceId);
    });

    it('同时传入 repositoryFilter 和 branchId', async () => {
      const result = await adapter.getChangeCount(0, ['Todo'], 'main');
      expect(typeof result.count).toBe('number');
      expect(typeof result.latestChangeId).toBe('number');
    });
  });

  // ============================================
  // latestChangeId 单调递增
  // ============================================

  describe('latestChangeId 单调性', () => {
    it('latestChangeId 不应小于 sinceId', async () => {
      const sinceId = 0;
      const { latestChangeId } = await adapter.getChangeCount(sinceId);
      expect(latestChangeId).toBeGreaterThanOrEqual(sinceId);
    });

    it('count > 0 时 latestChangeId 应严格大于 sinceId', async () => {
      const { count, latestChangeId } = await adapter.getChangeCount(0);
      if (count > 0) {
        expect(latestChangeId).toBeGreaterThan(0);
      }
    });

    it('使用上次的 latestChangeId 再次查询时 count 应减少', async () => {
      const first = await adapter.getChangeCount(0);

      // 用 latestChangeId 作为下一个 sinceId，此时应该 count=0
      const second = await adapter.getChangeCount(first.latestChangeId);
      expect(second.count).toBe(0);
      expect(second.latestChangeId).toBe(first.latestChangeId);
    });
  });
});
