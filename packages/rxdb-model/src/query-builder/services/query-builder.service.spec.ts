/**
 * @fileoverview QueryBuilderService 单元测试
 */

import { firstValueFrom, take, toArray } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldMetadata } from '../models/query-builder-state.js';
import { QueryBuilderService, createQueryBuilderService } from './query-builder.service.js';

// 测试用字段
const testFields: FieldMetadata[] = [
  { name: 'name', displayName: '名称', type: 'string' },
  { name: 'age', displayName: '年龄', type: 'number' },
  { name: 'active', displayName: '是否激活', type: 'boolean' },
  { name: 'createdAt', displayName: '创建时间', type: 'date' }
];

describe('QueryBuilderService', () => {
  let service: QueryBuilderService;

  beforeEach(() => {
    service = createQueryBuilderService({ fields: testFields });
  });

  describe('初始化', () => {
    it('应该创建空的根组', () => {
      const state = service.getState();
      expect(state.rootGroup).toBeDefined();
      expect(state.rootGroup.id).toBeDefined();
      expect(state.rootGroup.combinator).toBe('and');
      expect(state.rootGroup.rules).toEqual([]);
    });

    it('应该接受初始查询', () => {
      const initialService = createQueryBuilderService({
        initialQuery: {
          combinator: 'or',
          rules: [{ field: 'name', operator: '=', value: 'test' }]
        }
      });
      const state = initialService.getState();
      expect(state.rootGroup.combinator).toBe('or');
      expect(state.rootGroup.rules.length).toBe(1);
    });

    it('应该正确设置字段', () => {
      const fields = service.getFields();
      expect(fields).toHaveLength(4);
      expect(fields[0].name).toBe('name');
    });
  });

  describe('addRule', () => {
    it('应该添加规则到根组', () => {
      const ruleId = service.addRule(null, {
        field: 'name' as keyof object,
        operator: '=',
        value: 'test'
      });

      expect(ruleId).toBeDefined();
      const state = service.getState();
      expect(state.rootGroup.rules).toHaveLength(1);
    });

    it('应该为新规则生成唯一 ID', () => {
      const id1 = service.addRule();
      const id2 = service.addRule();
      expect(id1).not.toBe(id2);
    });

    it('应该触发状态更新', async () => {
      const states = firstValueFrom(service.state$.pipe(take(2), toArray()));

      service.addRule();

      const result = await states;
      expect(result.length).toBe(2);
    });
  });

  describe('addGroup', () => {
    it('应该添加子组到根组', () => {
      const groupId = service.addGroup(null, 'or');

      expect(groupId).toBeDefined();
      const state = service.getState();
      expect(state.rootGroup.rules).toHaveLength(1);

      const addedGroup = state.rootGroup.rules[0];
      expect('combinator' in addedGroup).toBe(true);
      if ('combinator' in addedGroup) {
        expect(addedGroup.combinator).toBe('or');
      }
    });

    it('应该限制最大嵌套深度', () => {
      // 创建 5 层嵌套
      const id1 = service.addGroup(); // 深度 2
      const id2 = service.addGroup(id1); // 深度 3
      const id3 = service.addGroup(id2); // 深度 4
      const id4 = service.addGroup(id3); // 深度 5

      // 第 6 层应该抛出错误
      expect(() => service.addGroup(id4)).toThrow(/最大嵌套深度/);
    });
  });

  describe('updateRule', () => {
    it('应该更新规则字段', () => {
      const ruleId = service.addRule(null, {
        field: 'name' as keyof object,
        operator: '=',
        value: 'old'
      });

      service.updateRule(ruleId, { value: 'new' });

      const state = service.getState();
      const rule = state.rootGroup.rules[0];
      if ('value' in rule) {
        expect(rule.value).toBe('new');
      }
    });
  });

  describe('updateGroupCombinator', () => {
    it('应该更新组合器', () => {
      const state = service.getState();
      service.updateGroupCombinator(state.rootGroup.id, 'or');

      const newState = service.getState();
      expect(newState.rootGroup.combinator).toBe('or');
    });
  });

  describe('remove', () => {
    it('应该删除规则', () => {
      const ruleId = service.addRule();
      expect(service.getState().rootGroup.rules).toHaveLength(1);

      service.remove(ruleId);
      expect(service.getState().rootGroup.rules).toHaveLength(0);
    });

    it('应该删除子组', () => {
      const groupId = service.addGroup();
      expect(service.getState().rootGroup.rules).toHaveLength(1);

      service.remove(groupId);
      expect(service.getState().rootGroup.rules).toHaveLength(0);
    });

    it('不应该允许删除根组', () => {
      const rootId = service.getState().rootGroup.id;
      expect(() => service.remove(rootId)).toThrow(/不能删除根组/);
    });
  });

  describe('clear', () => {
    it('应该清空所有规则', () => {
      service.addRule();
      service.addRule();
      service.addGroup();
      expect(service.getState().rootGroup.rules.length).toBeGreaterThan(0);

      service.clear();
      expect(service.getState().rootGroup.rules).toHaveLength(0);
    });
  });

  describe('toRxDBQuery / fromRxDBQuery', () => {
    it('应该正确转换到 RxDB Query 格式', () => {
      service.addRule(null, {
        field: 'name' as keyof object,
        operator: 'contains',
        value: 'test'
      });

      const query = service.toRxDBQuery();
      expect(query.combinator).toBe('and');
      expect(query.rules).toHaveLength(1);

      // RxDB Query 不应该有 id 字段
      const rule = query.rules[0];
      expect('id' in rule).toBe(false);
    });

    it('应该从 RxDB Query 加载', () => {
      service.fromRxDBQuery({
        combinator: 'or',
        rules: [
          { field: 'age', operator: '>', value: 18 },
          { field: 'active', operator: '=', value: true }
        ]
      });

      const state = service.getState();
      expect(state.rootGroup.combinator).toBe('or');
      expect(state.rootGroup.rules).toHaveLength(2);

      // QueryBuilder 状态应该有 id 字段
      state.rootGroup.rules.forEach(rule => {
        expect('id' in rule).toBe(true);
      });
    });
  });

  describe('validate', () => {
    it('应该对有效状态返回 valid', () => {
      service.addRule(null, {
        field: 'name' as keyof object,
        operator: '=',
        value: 'test'
      });

      const result = service.validate();
      expect(result.valid).toBe(true);
    });

    it('应该验证字段是否存在', () => {
      service.addRule(null, {
        field: 'nonexistent' as keyof object,
        operator: '=',
        value: 'test'
      });

      const result = service.validate();
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'fieldExists')).toBe(true);
    });
  });

  describe('Observables', () => {
    it('query$ 应该发出 RxDB Query 格式', async () => {
      const query = await firstValueFrom(service.query$);
      expect(query.combinator).toBeDefined();
      expect(query.rules).toBeDefined();
    });

    it('validation$ 应该发出校验结果', async () => {
      const validation = await firstValueFrom(service.validation$);
      expect(validation.valid).toBeDefined();
    });
  });

  describe('moveItem', () => {
    it('应该在同一组内重排规则', () => {
      const id1 = service.addRule(null, { field: 'name' as keyof object, operator: '=', value: 'a' });
      const id2 = service.addRule(null, { field: 'age' as keyof object, operator: '>', value: 1 });
      const id3 = service.addRule(null, { field: 'active' as keyof object, operator: '=', value: true });

      const rootId = service.getState().rootGroup.id;
      service.moveItem(id3, rootId, 0);

      const rules = service.getState().rootGroup.rules;
      expect(rules[0].id).toBe(id3);
      expect(rules[1].id).toBe(id1);
      expect(rules[2].id).toBe(id2);
    });

    it('应该跨组移动规则', () => {
      const ruleId = service.addRule(null, { field: 'name' as keyof object, operator: '=', value: 'a' });
      const groupId = service.addGroup();

      service.moveItem(ruleId, groupId, 0);

      const state = service.getState();
      expect(state.rootGroup.rules).toHaveLength(1);
      const group = state.rootGroup.rules[0];
      expect('rules' in group).toBe(true);
      if ('rules' in group) {
        expect(group.rules).toHaveLength(1);
        expect(group.rules[0].id).toBe(ruleId);
      }
    });

    it('不应该允许移动根组', () => {
      const rootId = service.getState().rootGroup.id;
      expect(() => service.moveItem(rootId, rootId, 0)).toThrow(/不能移动根组/);
    });

    it('不应该允许将组移到自身内部', () => {
      const groupId = service.addGroup();
      const innerGroupId = service.addGroup(groupId);

      expect(() => service.moveItem(groupId, innerGroupId, 0)).toThrow(/不能将分组移动到其自身内部/);
    });
  });

  describe('destroy', () => {
    it('应该完成所有 Observable', () => {
      let completed = false;
      service.state$.subscribe({
        complete: () => {
          completed = true;
        }
      });

      service.destroy();
      expect(completed).toBe(true);
    });
  });
});
