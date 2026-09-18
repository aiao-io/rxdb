/**
 * @fileoverview QueryConverter 单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { QueryBuilderRuleGroup, QueryBuilderState } from '../models/query-builder-state.js';
import { QueryConverter, createQueryConverter } from './query-converter.service.js';

interface TestEntity {
  name: string;
  age: number;
  active: boolean;
}

describe('QueryConverter', () => {
  let converter: QueryConverter<TestEntity>;

  beforeEach(() => {
    converter = createQueryConverter<TestEntity>();
  });

  describe('toRxDBQuery', () => {
    it('应该转换简单规则', () => {
      const state: QueryBuilderState<TestEntity> = {
        rootGroup: {
          id: 'root',
          combinator: 'and',
          rules: [{ id: 'rule-1', field: 'name', operator: '=', value: 'test' }]
        }
      };

      const query = converter.toRxDBQuery(state);

      expect(query.combinator).toBe('and');
      expect(query.rules).toHaveLength(1);

      const rule = query.rules[0];
      expect('id' in rule).toBe(false); // RxDB Query 没有 id
      expect('field' in rule && rule.field).toBe('name');
      expect('operator' in rule && rule.operator).toBe('=');
      expect('value' in rule && rule.value).toBe('test');
    });

    it('应该转换嵌套规则组', () => {
      const state: QueryBuilderState<TestEntity> = {
        rootGroup: {
          id: 'root',
          combinator: 'and',
          rules: [
            { id: 'rule-1', field: 'name', operator: '=', value: 'test' },
            {
              id: 'group-1',
              combinator: 'or',
              rules: [
                { id: 'rule-2', field: 'age', operator: '>', value: 18 },
                { id: 'rule-3', field: 'active', operator: '=', value: true }
              ]
            }
          ]
        }
      };

      const query = converter.toRxDBQuery(state);

      expect(query.rules).toHaveLength(2);

      const nestedGroup = query.rules[1];
      expect('combinator' in nestedGroup).toBe(true);
      if ('combinator' in nestedGroup) {
        expect(nestedGroup.combinator).toBe('or');
        expect(nestedGroup.rules).toHaveLength(2);
      }
    });

    it('应该移除所有 id 字段', () => {
      const state: QueryBuilderState<TestEntity> = {
        rootGroup: {
          id: 'root',
          combinator: 'and',
          rules: [
            { id: 'rule-1', field: 'name', operator: '=', value: 'a' },
            {
              id: 'group-1',
              combinator: 'or',
              rules: [{ id: 'rule-2', field: 'age', operator: '>', value: 1 }]
            }
          ]
        }
      };

      const query = converter.toRxDBQuery(state);

      const hasId = (obj: unknown): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;
        if ('id' in obj) return true;
        if ('rules' in obj && Array.isArray((obj as { rules: unknown[] }).rules)) {
          return (obj as { rules: unknown[] }).rules.some(hasId);
        }
        return false;
      };

      expect(hasId(query)).toBe(false);
    });
  });

  describe('fromRxDBQuery', () => {
    it('应该转换简单查询', () => {
      const state = converter.fromRxDBQuery({
        combinator: 'and',
        rules: [{ field: 'name', operator: '=', value: 'test' }]
      });

      expect(state.rootGroup.id).toBeDefined();
      expect(state.rootGroup.combinator).toBe('and');
      expect(state.rootGroup.rules).toHaveLength(1);

      const rule = state.rootGroup.rules[0];
      expect('id' in rule).toBe(true);
    });

    it('应该转换嵌套查询', () => {
      const state = converter.fromRxDBQuery({
        combinator: 'or',
        rules: [
          { field: 'name', operator: 'contains', value: 'test' },
          {
            combinator: 'and',
            rules: [
              { field: 'age', operator: '>=', value: 18 },
              { field: 'age', operator: '<=', value: 65 }
            ]
          }
        ]
      });

      expect(state.rootGroup.combinator).toBe('or');
      expect(state.rootGroup.rules).toHaveLength(2);

      const nestedGroup = state.rootGroup.rules[1] as QueryBuilderRuleGroup<TestEntity>;
      expect(nestedGroup.id).toBeDefined();
      expect(nestedGroup.combinator).toBe('and');
      expect(nestedGroup.rules).toHaveLength(2);
    });

    it('应该为所有项生成唯一 id', () => {
      const state = converter.fromRxDBQuery({
        combinator: 'and',
        rules: [
          { field: 'name', operator: '=', value: 'a' },
          { field: 'name', operator: '=', value: 'b' }
        ]
      });

      const rule1 = state.rootGroup.rules[0] as { id: string };
      const rule2 = state.rootGroup.rules[1] as { id: string };

      expect(rule1.id).not.toBe(rule2.id);
      expect(rule1.id).not.toBe(state.rootGroup.id);
    });
  });

  describe('双向转换', () => {
    it('应该保持数据一致性', () => {
      const originalState: QueryBuilderState<TestEntity> = {
        rootGroup: {
          id: 'root',
          combinator: 'or',
          rules: [
            { id: 'r1', field: 'name', operator: 'startsWith', value: 'A' },
            { id: 'r2', field: 'age', operator: 'between', value: [18, 65] },
            {
              id: 'g1',
              combinator: 'and',
              rules: [{ id: 'r3', field: 'active', operator: '=', value: true }]
            }
          ]
        }
      };

      // QueryBuilder -> RxDB -> QueryBuilder
      const rxdbQuery = converter.toRxDBQuery(originalState);
      const restoredState = converter.fromRxDBQuery(rxdbQuery);

      // 验证结构一致（id 会不同）
      expect(restoredState.rootGroup.combinator).toBe(originalState.rootGroup.combinator);
      expect(restoredState.rootGroup.rules.length).toBe(originalState.rootGroup.rules.length);
    });
  });

  describe('自定义 ID 生成器', () => {
    it('应该使用自定义 ID 生成器', () => {
      let counter = 0;
      const customConverter = createQueryConverter<TestEntity>({
        idGenerator: () => `custom-${++counter}`
      });

      const state = customConverter.fromRxDBQuery({
        combinator: 'and',
        rules: [{ field: 'name', operator: '=', value: 'test' }]
      });

      // 注意：实现中先递归处理子规则，再生成当前组的 ID
      // 所以规则先获得 custom-1，根组获得 custom-2
      const rule = state.rootGroup.rules[0] as { id: string };
      expect(rule.id).toBe('custom-1');
      expect(state.rootGroup.id).toBe('custom-2');
    });
  });
});
