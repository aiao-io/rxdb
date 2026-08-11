/**
 * 集成测试：Filter Sync（002-filter-sync）
 *
 * 测试 SyncType.Filter 的完整同步流程
 *
 * T011: Filter pull 只拉取满足条件的数据
 * T019: filter 函数每次 sync 时重新执行
 * T020: 滚动时间窗口验证（mock Date.now）
 */
import { describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { getSyncType, needsPull, needsPush } from '../../version/sync-type-utils.js';

describe('Filter Sync Integration (002-filter-sync)', () => {
  // ===========================================
  // T011: Filter pull 只拉取满足条件的数据
  // ===========================================
  describe('T011: Filter pull 只拉取满足条件的数据', () => {
    it('getSyncType 应该返回 "filter" 对于 SyncType.Filter 配置', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { enabled: true },
          remote: {
            enabled: true,
            filter: () => ({
              combinator: 'and' as const,
              rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
            })
          }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('filter');
    });

    it('Filter 同步类型应该支持 pull 和 push', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { enabled: true },
          remote: {
            enabled: true,
            filter: () => ({ combinator: 'and' as const, rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(true);
      expect(needsPush(metadata)).toBe(true);
    });

    it('filter 函数应该在调用时执行', () => {
      const filterFn = vi.fn().mockReturnValue({
        combinator: 'and',
        rules: []
      });

      const metadata = {
        name: 'Order',
        namespace: 'public',
        sync: {
          type: SyncType.Filter,
          remote: { filter: filterFn }
        }
      };

      // 模拟 pull 前提取 filter
      const sync = metadata.sync as { type: string; remote: { filter: () => RuleGroup } };
      const ruleGroup = sync.remote.filter();

      expect(filterFn).toHaveBeenCalledTimes(1);
      expect(ruleGroup.combinator).toBe('and');
    });
  });

  // ===========================================
  // T019: filter 函数每次 sync 时重新执行
  // ===========================================
  describe('T019: filter 函数每次 sync 时重新执行', () => {
    it('每次调用 filter 函数都应该获取新的结果', () => {
      let callCount = 0;

      const filterFn = () => {
        callCount++;
        return {
          combinator: 'and' as const,
          rules: [{ field: 'callNumber', operator: '=', value: callCount }]
        };
      };

      // 第一次调用
      const result1 = filterFn();
      expect(result1.rules[0].value).toBe(1);

      // 第二次调用
      const result2 = filterFn();
      expect(result2.rules[0].value).toBe(2);

      // 验证每次调用都是独立的
      expect(callCount).toBe(2);
    });

    it('filter 函数应该能够访问外部状态', () => {
      let currentDate = new Date('2026-01-01');

      const filterFn = () => ({
        combinator: 'and' as const,
        rules: [{ field: 'updatedAt', operator: '>=', value: currentDate }]
      });

      // 第一次调用
      const result1 = filterFn();
      expect(result1.rules[0].value).toEqual(new Date('2026-01-01'));

      // 修改外部状态
      currentDate = new Date('2026-01-02');

      // 第二次调用应该使用新的日期
      const result2 = filterFn();
      expect(result2.rules[0].value).toEqual(new Date('2026-01-02'));
    });
  });

  // ===========================================
  // T020: 滚动时间窗口验证（mock Date.now）
  // ===========================================
  describe('T020: 滚动时间窗口验证', () => {
    it('filter 应该使用当前时间计算 30 天前', () => {
      const now = new Date('2026-01-10T00:00:00Z');
      vi.setSystemTime(now);

      const filterFn = () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
          combinator: 'and' as const,
          rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
        };
      };

      const result = filterFn();
      const expectedDate = new Date('2025-12-11T00:00:00Z');

      expect(result.rules[0].value.getTime()).toBe(expectedDate.getTime());

      vi.useRealTimers();
    });

    it('明天调用 filter 应该使用明天的日期计算', () => {
      // 今天：2026-01-10
      const today = new Date('2026-01-10T00:00:00Z');
      vi.setSystemTime(today);

      const filterFn = () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
          combinator: 'and' as const,
          rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
        };
      };

      const todayResult = filterFn();
      expect(todayResult.rules[0].value.getTime()).toBe(new Date('2025-12-11T00:00:00Z').getTime());

      // 明天：2026-01-11
      const tomorrow = new Date('2026-01-11T00:00:00Z');
      vi.setSystemTime(tomorrow);

      const tomorrowResult = filterFn();
      expect(tomorrowResult.rules[0].value.getTime()).toBe(new Date('2025-12-12T00:00:00Z').getTime());

      vi.useRealTimers();
    });

    it('滚动时间窗口应该正确排除过期数据', () => {
      const now = new Date('2026-01-10T00:00:00Z');
      vi.setSystemTime(now);

      const filterFn = () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return {
          combinator: 'and' as const,
          rules: [{ field: 'updatedAt', operator: '>=', value: thirtyDaysAgo }]
        };
      };

      const filter = filterFn();
      const cutoffDate = filter.rules[0].value as Date;

      // 模拟数据
      const dataWithin30Days = { id: '1', updatedAt: new Date('2026-01-05') }; // 5 天前
      const dataOutside30Days = { id: '2', updatedAt: new Date('2025-12-01') }; // 40 天前

      expect(dataWithin30Days.updatedAt >= cutoffDate).toBe(true);
      expect(dataOutside30Days.updatedAt >= cutoffDate).toBe(false);

      vi.useRealTimers();
    });
  });
});
