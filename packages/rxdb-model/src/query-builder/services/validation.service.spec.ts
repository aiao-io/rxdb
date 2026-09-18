/**
 * @fileoverview ValidationService 单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { FieldMetadata, UIRule } from '../models/query-builder-state.js';
import type { ValidationRule } from '../models/validation.interface.js';
import { ValidationService, createValidationService } from './validation.service.js';

describe('ValidationService', () => {
  let service: ValidationService;
  const testField: FieldMetadata = {
    name: 'age',
    displayName: '年龄',
    type: 'number'
  };

  beforeEach(() => {
    service = createValidationService();
  });

  describe('T091: 类型验证', () => {
    it('应该验证字符串类型的值', () => {
      const rule = {
        id: '1',
        field: 'name',
        operator: '=',
        value: 'test'
      };
      const field: FieldMetadata = {
        name: 'name',
        displayName: '名称',
        type: 'string'
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(true);
    });

    it('应该验证数字类型的值', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: '>',
        value: 18
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(true);
    });

    it('应该验证布尔类型的值', () => {
      const rule = {
        id: '1',
        field: 'active',
        operator: '=',
        value: true
      };
      const field: FieldMetadata = {
        name: 'active',
        displayName: '激活',
        type: 'boolean'
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(true);
    });

    it('应该验证日期类型的值', () => {
      const rule = {
        id: '1',
        field: 'createdAt',
        operator: '>',
        value: new Date('2025-01-01')
      };
      const field: FieldMetadata = {
        name: 'createdAt',
        displayName: '创建时间',
        type: 'date'
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(true);
    });

    it('应该拒绝空值（单值操作符）', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: '=',
        value: ''
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
      // 验证错误信息包含字段的 displayName
      expect(result.errors?.some(e => e.message === '年龄需要提供一个值')).toBe(true);
    });

    it('应该在错误信息中显示字段的 displayName', () => {
      const field: FieldMetadata = {
        name: 'createdAt',
        displayName: '创建时间',
        type: 'date'
      };

      const rule = {
        id: '1',
        field: 'createdAt',
        operator: '>',
        value: ''
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      // 验证错误信息包含 displayName 而不是技术字段名
      expect(result.errors?.some(e => e.message === '创建时间需要提供一个值')).toBe(true);
    });

    it('应该允许 null/notNull 操作符无值', () => {
      const nullableField: FieldMetadata = {
        name: 'age',
        displayName: '年龄',
        type: 'number',
        nullable: true
      };

      const ruleNull = {
        id: '1',
        field: 'age',
        operator: 'null',
        value: undefined
      };

      const result = service.validateRule(ruleNull, nullableField);
      // null/notNull 操作符不需要值，应该通过验证
      expect(result.valid).toBe(true);
    });

    it('应该在数组类型错误信息中显示 displayName', () => {
      const field: FieldMetadata = {
        name: 'tags',
        displayName: '标签',
        type: 'array'
      };

      const rule = {
        id: '1',
        field: 'tags',
        operator: 'in',
        value: [] // 空数组无效
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message === '标签需要提供一个或多个值')).toBe(true);
    });

    it('应该在范围类型错误信息中显示 displayName', () => {
      const field: FieldMetadata = {
        name: 'price',
        displayName: '价格',
        type: 'number'
      };

      const rule = {
        id: '1',
        field: 'price',
        operator: 'between',
        value: [100] // 只有一个值，无效
      };

      const result = service.validateRule(rule, field);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message === '价格需要提供两个值（范围）')).toBe(true);
    });
  });

  describe('T092: 子查询验证', () => {
    const relationField: FieldMetadata = {
      name: 'orders',
      displayName: '订单',
      type: 'relation',
      isRelation: true,
      relationFields: []
    };

    it('应该允许简单的 exists 操作符（无 where 条件）', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: undefined
      };

      const result = service.validateRule(rule, relationField);
      expect(result.valid).toBe(true);
    });

    it('应该允许带有效 where 子查询的 exists', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: undefined,
        where: {
          id: 'where-1',
          combinator: 'and' as const,
          rules: [
            {
              id: 'amount-rule',
              field: 'amount',
              operator: '>',
              value: 100
            }
          ]
        }
      };

      const result = service.validateRule(
        { ...rule, value: rule.where } as Parameters<ValidationService['validateRule']>[0],
        relationField
      );
      expect(result.valid).toBe(true);
    });

    it('应该拒绝空的 where 子查询', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: '',
        where: {
          combinator: 'and',
          rules: [] // 空的 rules 数组
        }
      } as unknown as UIRule;

      const result = service.validateRule(rule, relationField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
      expect(result.errors?.some(e => e.message.includes('不能为空'))).toBe(true);
    });

    it('应该拒绝无效的 where 子查询格式', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: '',
        where: 'invalid-subquery' // where 格式无效
      } as unknown as UIRule;

      const result = service.validateRule(rule, relationField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
      expect(result.errors?.some(e => e.message.includes('格式无效'))).toBe(true);
    });

    it('应该验证 where 子查询内部规则的值', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: '',
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'id',
              operator: '=',
              value: '' // 空值无效
            }
          ]
        }
      } as unknown as UIRule;

      const result = service.validateRule(rule, relationField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
      // 子查询中的字段没有 displayName，会使用 fieldName（"id"）
      expect(result.errors?.some(e => e.message === 'id需要提供一个值')).toBe(true);
    });

    it('应该递归验证嵌套的子查询', () => {
      const rule = {
        id: '1',
        field: 'orders',
        operator: 'exists',
        value: '',
        where: {
          combinator: 'and',
          rules: [
            {
              field: 'customer',
              operator: 'exists',
              where: {
                combinator: 'and',
                rules: [] // 嵌套子查询为空
              }
            }
          ]
        }
      } as unknown as UIRule;

      const result = service.validateRule(rule, relationField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.message.includes('不能为空'))).toBe(true);
    });
  });

  describe('T091: 数组值验证', () => {
    it('应该验证 in 操作符需要数组', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'in',
        value: [18, 25, 30]
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(true);
    });

    it('应该拒绝 in 操作符的空数组', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'in',
        value: []
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
    });

    it('应该拒绝 in 操作符的非数组值', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'in',
        value: 18
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
    });
  });

  describe('T091: 范围值验证', () => {
    it('应该验证 between 操作符需要两个值', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'between',
        value: [18, 65]
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(true);
    });

    it('应该拒绝 between 操作符的单个值', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'between',
        value: [18]
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'valueType')).toBe(true);
    });

    it('应该拒绝 between 操作符的超过两个值', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'between',
        value: [18, 30, 65]
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
    });
  });

  describe('T092: 操作符与类型匹配验证', () => {
    it('应该验证操作符支持该字段类型', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: '>',
        value: 18
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(true);
    });

    it('应该拒绝不支持的操作符-类型组合', () => {
      const rule = {
        id: '1',
        field: 'age',
        operator: 'contains', // contains 不支持 number 类型
        value: 18
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'operatorTypeMatch')).toBe(true);
    });
  });

  describe('T092: validateGroup 方法', () => {
    it('应该验证整个规则组', () => {
      const fields = new Map<string, FieldMetadata>();
      fields.set('age', testField);
      fields.set('name', {
        name: 'name',
        displayName: '名称',
        type: 'string'
      });

      const group = {
        id: 'root',
        combinator: 'and' as const,
        rules: [
          {
            id: '1',
            field: 'age',
            operator: '>',
            value: 18
          },
          {
            id: '2',
            field: 'name',
            operator: '=',
            value: 'test'
          }
        ]
      };

      const result = service.validateGroup(group, fields);
      expect(result.valid).toBe(true);
    });

    it('应该检测不存在的字段', () => {
      const fields = new Map<string, FieldMetadata>();
      fields.set('age', testField);

      const group = {
        id: 'root',
        combinator: 'and' as const,
        rules: [
          {
            id: '1',
            field: 'nonexistent',
            operator: '=',
            value: 'test'
          }
        ]
      };

      const result = service.validateGroup(group, fields);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'fieldExists')).toBe(true);
    });

    it('应该递归验证嵌套组', () => {
      const fields = new Map<string, FieldMetadata>();
      fields.set('age', testField);

      const group = {
        id: 'root',
        combinator: 'and' as const,
        rules: [
          {
            id: 'nested',
            combinator: 'or' as const,
            rules: [
              {
                id: '1',
                field: 'age',
                operator: '>',
                value: '' // 无效值
              }
            ]
          }
        ]
      };

      const result = service.validateGroup(group, fields);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('应该收集多个错误', () => {
      const fields = new Map<string, FieldMetadata>();
      fields.set('age', testField);

      const group = {
        id: 'root',
        combinator: 'and' as const,
        rules: [
          {
            id: '1',
            field: 'age',
            operator: '=',
            value: '' // 错误1：空值
          },
          {
            id: '2',
            field: 'nonexistent',
            operator: '=',
            value: 'test' // 错误2：字段不存在
          }
        ]
      };

      const result = service.validateGroup(group, fields);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('自定义验证规则', () => {
    it('应该支持注册自定义规则', () => {
      const customRule: ValidationRule = {
        name: 'customPositive',
        message: '值必须为正数',
        validate: context => {
          if (context.fieldType === 'number' && typeof context.value === 'number') {
            return context.value > 0;
          }
          return true;
        },
        appliesTo: ['number']
      };

      service.registerRule(customRule);

      const rule = {
        id: '1',
        field: 'age',
        operator: '=',
        value: -5
      };

      const result = service.validateRule(rule, testField);
      expect(result.valid).toBe(false);
      expect(result.errors?.some(e => e.rule === 'customPositive')).toBe(true);
    });

    it('应该支持移除验证规则', () => {
      const customRule: ValidationRule = {
        name: 'testRule',
        message: 'Test',
        validate: () => false
      };

      service.registerRule(customRule);
      expect(service.getRules().some(r => r.name === 'testRule')).toBe(true);

      const removed = service.unregisterRule('testRule');
      expect(removed).toBe(true);
      expect(service.getRules().some(r => r.name === 'testRule')).toBe(false);
    });

    it('应该在创建时接受自定义规则', () => {
      const customRule: ValidationRule = {
        name: 'alwaysFail',
        message: 'Always fails',
        validate: () => false
      };

      const customService = createValidationService({
        customRules: [customRule]
      });

      const rule = {
        id: '1',
        field: 'age',
        operator: '=',
        value: 18
      };

      const result = customService.validateRule(rule, testField);
      expect(result.valid).toBe(false);
    });
  });

  describe('内置规则选项', () => {
    it('应该可以禁用内置规则', () => {
      const serviceWithoutBuiltin = createValidationService({
        useBuiltinRules: false
      });

      // 不会有类型验证等内置规则
      const rules = serviceWithoutBuiltin.getRules();
      expect(rules.length).toBe(0);
    });
  });
});
