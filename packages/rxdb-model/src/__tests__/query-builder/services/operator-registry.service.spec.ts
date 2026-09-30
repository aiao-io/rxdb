/**
 * @fileoverview OperatorRegistry 单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPERATORS } from '../../../query-builder/models/operator.interface.js';
import {
  OperatorRegistry,
  createOperatorRegistry,
  getDefaultOperatorRegistry
} from '../../../query-builder/services/operator-registry.service.js';

describe('OperatorRegistry', () => {
  let registry: OperatorRegistry;

  beforeEach(() => {
    registry = createOperatorRegistry();
  });

  describe('初始化', () => {
    it('应该加载默认操作符', () => {
      expect(registry.size).toBe(DEFAULT_OPERATORS.length);
    });

    it('可以不加载默认操作符', () => {
      const emptyRegistry = createOperatorRegistry({ useDefaultOperators: false });
      expect(emptyRegistry.size).toBe(0);
    });

    it('可以添加自定义操作符', () => {
      const customRegistry = createOperatorRegistry({
        operators: [
          {
            key: '=' as const,
            label: '自定义等于',
            valueType: 'single',
            applicableTypes: ['string']
          }
        ]
      });

      const op = customRegistry.get('=');
      expect(op?.label).toBe('自定义等于');
    });
  });

  describe('register / unregister', () => {
    it('应该注册新操作符', () => {
      // 注册一个测试操作符 - 由于 OperatorName 是固定的，我们覆盖一个已有的
      registry.register({
        key: 'contains',
        label: '自定义包含',
        valueType: 'single',
        applicableTypes: ['string', 'number']
      });

      const op = registry.get('contains');
      expect(op?.label).toBe('自定义包含');
    });

    it('应该移除操作符', () => {
      expect(registry.get('=')).toBeDefined();

      const removed = registry.unregister('=');
      expect(removed).toBe(true);
      expect(registry.get('=')).toBeUndefined();
    });
  });

  describe('get / getAll', () => {
    it('应该获取指定操作符', () => {
      const op = registry.get('=');
      expect(op).toBeDefined();
      expect(op?.key).toBe('=');
    });

    it('应该返回所有操作符', () => {
      const all = registry.getAll();
      expect(all.length).toBe(registry.size);
    });
  });

  describe('getForType', () => {
    it('应该返回 string 类型的操作符', () => {
      const ops = registry.getForType('string');
      expect(ops.length).toBeGreaterThan(0);

      // 验证所有返回的操作符都支持 string
      ops.forEach(op => {
        expect(op.applicableTypes).toContain('string');
      });
    });

    it('应该返回 number 类型的操作符', () => {
      const ops = registry.getForType('number');
      expect(ops.length).toBeGreaterThan(0);

      ops.forEach(op => {
        expect(op.applicableTypes).toContain('number');
      });
    });

    it('应该返回 boolean 类型的操作符', () => {
      const ops = registry.getForType('boolean');
      expect(ops.length).toBeGreaterThan(0);

      // boolean 通常只支持 = 和 !=
      ops.forEach(op => {
        expect(op.applicableTypes).toContain('boolean');
      });
    });

    it('应该返回 date 类型的操作符', () => {
      const ops = registry.getForType('date');
      expect(ops.length).toBeGreaterThan(0);
    });

    it('应该返回 relation 类型的操作符', () => {
      const ops = registry.getForType('relation');
      expect(ops.length).toBeGreaterThan(0);

      // relation 应该支持 exists/notExists
      const hasExists = ops.some(op => op.key === 'exists');
      expect(hasExists).toBe(true);
    });

    it('应该返回 enum 类型的操作符', () => {
      const ops = registry.getForType('enum');
      expect(ops.length).toBeGreaterThan(0);

      const operatorKeys = ops.map(op => op.key);
      expect(operatorKeys).toContain('=');
      expect(operatorKeys).toContain('!=');
      expect(operatorKeys).toContain('in');
      expect(operatorKeys).toContain('notIn');

      // enum 不应包含字符串专用操作符
      expect(operatorKeys).not.toContain('contains');
      expect(operatorKeys).not.toContain('startsWith');
      expect(operatorKeys).not.toContain('between');
    });
  });

  describe('isOperatorSupportedForType', () => {
    it('= 应该支持 string', () => {
      expect(registry.isOperatorSupportedForType('=', 'string')).toBe(true);
    });

    it('contains 不应该支持 number', () => {
      expect(registry.isOperatorSupportedForType('contains', 'number')).toBe(false);
    });

    it('between 应该支持 number', () => {
      expect(registry.isOperatorSupportedForType('between', 'number')).toBe(true);
    });

    it('between 不应该支持 boolean', () => {
      expect(registry.isOperatorSupportedForType('between', 'boolean')).toBe(false);
    });
  });

  describe('getValueType', () => {
    it('= 应该是 single', () => {
      expect(registry.getValueType('=')).toBe('single');
    });

    it('in 应该是 array', () => {
      expect(registry.getValueType('in')).toBe('array');
    });

    it('between 应该是 range', () => {
      expect(registry.getValueType('between')).toBe('range');
    });

    it('null 应该是 none', () => {
      expect(registry.getValueType('null')).toBe('none');
    });
  });

  describe('clear / reset', () => {
    it('clear 应该清空所有操作符', () => {
      registry.clear();
      expect(registry.size).toBe(0);
    });

    it('reset 应该恢复默认操作符', () => {
      registry.clear();
      expect(registry.size).toBe(0);

      registry.reset();
      expect(registry.size).toBe(DEFAULT_OPERATORS.length);
    });
  });

  describe('getDefaultOperatorRegistry', () => {
    it('应该返回单例', () => {
      const r1 = getDefaultOperatorRegistry();
      const r2 = getDefaultOperatorRegistry();
      expect(r1).toBe(r2);
    });
  });

  describe('nullable field support', () => {
    it('应该为 nullable 字段添加 null/notNull 操作符', () => {
      const field = {
        name: 'gender',
        displayName: '性别',
        type: 'string' as const,
        nullable: true
      };

      const operators = registry.getForField(field);
      const operatorKeys = operators.map(op => op.key);

      expect(operatorKeys).toContain('null');
      expect(operatorKeys).toContain('notNull');
    });

    it('非 nullable 字段不应包含 null/notNull 操作符', () => {
      const field = {
        name: 'name',
        displayName: '姓名',
        type: 'string' as const,
        nullable: false
      };

      const operators = registry.getForField(field);
      const operatorKeys = operators.map(op => op.key);

      expect(operatorKeys).not.toContain('null');
      expect(operatorKeys).not.toContain('notNull');
    });

    it('isOperatorSupportedForField 应该支持 nullable 字段的 null 操作符', () => {
      const nullableField = {
        name: 'age',
        displayName: '年龄',
        type: 'number' as const,
        nullable: true
      };

      expect(registry.isOperatorSupportedForField('null', nullableField)).toBe(true);
      expect(registry.isOperatorSupportedForField('notNull', nullableField)).toBe(true);
    });

    it('isOperatorSupportedForField 不应支持非 nullable 字段的 null 操作符', () => {
      const nonNullableField = {
        name: 'age',
        displayName: '年龄',
        type: 'number' as const,
        nullable: false
      };

      expect(registry.isOperatorSupportedForField('null', nonNullableField)).toBe(false);
      expect(registry.isOperatorSupportedForField('notNull', nonNullableField)).toBe(false);
    });
  });
});
