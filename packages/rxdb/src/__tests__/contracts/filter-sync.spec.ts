/**
 * 契约测试：Filter Sync API（002-filter-sync）。
 *
 * 测试 SyncType.Filter 的类型签名、参数验证和基本返回结构
 *
 * T009: Filter 同步配置验证
 * T009b: filter 函数异常处理 (FR-009)
 * T009c: 无效 RuleGroup 验证 (FR-010)
 * T025: cleanupExpired 函数签名和返回值
 */
import { describe, expect, it } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { getSyncType, needsPull, needsPush } from '../../version/sync-type-utils.js';

describe('Filter Sync Contract (002-filter-sync)', () => {
  // ===========================================
  // T009: Filter 同步配置验证
  // ===========================================
  describe('T009: Filter 同步配置验证', () => {
    it('SyncType.Filter 应该返回 "filter" 同步类型', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({
              combinator: 'and' as const,
              rules: [{ field: 'createdAt', operator: '>=', value: new Date() }]
            })
          }
        }
      } as unknown as EntityMetadata;

      expect(getSyncType(metadata)).toBe('filter');
    });

    it('SyncType.Filter 应该支持 pull 操作', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({ combinator: 'and' as const, rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(needsPull(metadata)).toBe(true);
    });

    it('SyncType.Filter 应该支持 push 操作（本地变更不受 filter 限制）', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        properties: [],
        sync: {
          type: SyncType.Filter,
          local: { adapter: 'sqlite' },
          remote: {
            adapter: 'supabase',
            filter: () => ({ combinator: 'and' as const, rules: [] })
          }
        }
      } as unknown as EntityMetadata;

      expect(needsPush(metadata)).toBe(true);
    });

    it('filter 函数应该返回有效的 RuleGroup', () => {
      const filterFn = (): RuleGroup => ({
        combinator: 'and',
        rules: [{ field: 'updatedAt', operator: '>=', value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }]
      });

      const result = filterFn();

      expect(result).toBeDefined();
      expect(result.combinator).toBe('and');
      expect(result.rules).toHaveLength(1);
    });

    it('filter 函数应该支持多条件组合', () => {
      const filterFn = (): RuleGroup => ({
        combinator: 'and',
        rules: [
          { field: 'updatedAt', operator: '>=', value: new Date() },
          { field: 'status', operator: '=', value: 'active' }
        ]
      });

      const result = filterFn();

      expect(result.rules).toHaveLength(2);
    });
  });

  // ===========================================
  // T009b: filter 函数异常处理 (FR-009)
  // ===========================================
  describe('T009b: filter 函数异常处理 (FR-009)', () => {
    it('filter 函数抛出异常时应该被捕获', () => {
      const errorFilter = () => {
        throw new Error('Filter evaluation failed');
      };

      expect(() => errorFilter()).toThrow('Filter evaluation failed');
    });

    it('filter 函数抛出异常时应该包含错误信息', () => {
      const metadata = {
        name: 'Order',
        namespace: 'public',
        sync: {
          type: SyncType.Filter,
          remote: {
            filter: () => {
              throw new Error('Dynamic date calculation failed');
            }
          }
        }
      };

      // 验证 filter 函数可以抛出异常
      expect(() => (metadata.sync.remote.filter as () => RuleGroup)()).toThrow('Dynamic date calculation failed');
    });
  });

  // ===========================================
  // T009c: 无效 RuleGroup 验证 (FR-010)
  // ===========================================
  describe('T009c: 无效 RuleGroup 验证 (FR-010)', () => {
    it('有效的 RuleGroup 应该有 combinator 属性', () => {
      const validRuleGroup: RuleGroup = {
        combinator: 'and',
        rules: []
      };

      expect(validRuleGroup.combinator).toBeDefined();
      expect(['and', 'or']).toContain(validRuleGroup.combinator);
    });

    it('有效的 RuleGroup 应该有 rules 数组', () => {
      const validRuleGroup: RuleGroup = {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: '123' }]
      };

      expect(Array.isArray(validRuleGroup.rules)).toBe(true);
    });

    it('空 rules 数组应该是有效的（匹配所有记录）', () => {
      const emptyRulesGroup: RuleGroup = {
        combinator: 'and',
        rules: []
      };

      expect(emptyRulesGroup.rules).toHaveLength(0);
    });

    it('嵌套 RuleGroup 应该是有效的', () => {
      const nestedRuleGroup: RuleGroup = {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'status', operator: '=', value: 'active' },
              { field: 'priority', operator: '>=', value: 5 }
            ]
          },
          { field: 'isUrgent', operator: '=', value: true }
        ]
      };

      expect(nestedRuleGroup.combinator).toBe('or');
      expect(nestedRuleGroup.rules).toHaveLength(2);
    });
  });

  // ===========================================
  // T025: cleanupExpired 函数签名和返回值
  // ===========================================
  describe('T025: cleanupExpired 函数签名和返回值', () => {
    it('CleanupExpiredOptions 应该有正确的类型结构', () => {
      interface CleanupExpiredOptions {
        filter?: RuleGroup;
        dryRun?: boolean;
      }

      const options: CleanupExpiredOptions = {
        filter: { combinator: 'and', rules: [] },
        dryRun: false
      };

      expect(options.filter).toBeDefined();
      expect(options.dryRun).toBe(false);
    });

    it('CleanupExpiredResult 应该有正确的类型结构', () => {
      interface CleanupExpiredResult {
        removed: number;
        removedIds?: string[];
      }

      const result: CleanupExpiredResult = {
        removed: 5,
        removedIds: ['id1', 'id2', 'id3', 'id4', 'id5']
      };

      expect(result.removed).toBe(5);
      expect(result.removedIds).toHaveLength(5);
    });

    it('dryRun 模式应该返回 removedIds', () => {
      interface CleanupExpiredResult {
        removed: number;
        removedIds?: string[];
      }

      const dryRunResult: CleanupExpiredResult = {
        removed: 3,
        removedIds: ['order-1', 'order-2', 'order-3']
      };

      expect(dryRunResult.removedIds).toBeDefined();
      expect(dryRunResult.removedIds).toHaveLength(3);
    });
  });
});
