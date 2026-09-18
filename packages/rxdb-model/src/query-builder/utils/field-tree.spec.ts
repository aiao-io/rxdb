import { describe, expect, it } from 'vitest';
import type { FieldMetadata } from '../models/query-builder-state.js';
import {
  buildFieldTree,
  createFieldNodeMap,
  findNodeByValue,
  flattenFieldTree,
  getDisplayNamePath,
  getOptionGroupChildren,
  type FieldTreeNode
} from './field-tree.js';

describe('field-tree', () => {
  describe('buildFieldTree', () => {
    it('应该处理空数组', () => {
      const result = buildFieldTree([]);
      expect(result).toEqual([]);
    });

    it('应该处理单个顶层字段', () => {
      const fields: FieldMetadata[] = [{ name: 'name', displayName: '姓名', type: 'string', nullable: false }];
      const result = buildFieldTree(fields);
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('name');
      expect(result[0].value).toBe('name');
      expect(result[0].displayName).toBe('姓名');
      expect(result[0].type).toBe('string');
      expect(result[0].isRelation).toBe(false);
    });

    it('应该处理去重字段', () => {
      const fields: FieldMetadata[] = [
        { name: 'name', displayName: '姓名', type: 'string', nullable: false },
        { name: 'name', displayName: '姓名2', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);
      expect(result).toHaveLength(1);
    });

    it('应该正确构建嵌套字段结构', () => {
      const fields: FieldMetadata[] = [
        { name: 'name', displayName: '姓名', type: 'string', nullable: false },
        { name: 'orders', displayName: '订单', type: 'relation', isRelation: true },
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false },
        { name: 'orders.items', displayName: '订单.项', type: 'relation', isRelation: true },
        { name: 'orders.items.productName', displayName: '订单.项.商品名称', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);

      // 顶层应该有 name 和 orders
      expect(result).toHaveLength(2);
      const nameNode = result.find(n => n.label === 'name');
      expect(nameNode).toBeDefined();

      const ordersNode = result.find(n => n.label === 'orders');
      expect(ordersNode).toBeDefined();
      expect(ordersNode?.isRelation).toBe(true);
      expect(ordersNode?.children).toBeDefined();
      expect(ordersNode?.children?.length).toBeGreaterThan(0);
    });

    it('应该正确处理虚拟父节点', () => {
      const fields: FieldMetadata[] = [
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false }
      ];
      const result = buildFieldTree(fields);

      // 应该创建虚拟父节点
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('orders');
      expect(result[0].isRelation).toBe(true);
      expect(result[0].children).toBeDefined();
    });

    it('应该正确处理关系字段', () => {
      const fields: FieldMetadata[] = [
        { name: 'user', displayName: '用户', type: 'relation', isRelation: true },
        { name: 'user.name', displayName: '用户.姓名', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);

      const userNode = result.find(n => n.label === 'user');
      expect(userNode?.isRelation).toBe(true);
    });

    it('应该正确处理带 description 和 required 的字段', () => {
      const fields: FieldMetadata[] = [
        {
          name: 'name',
          displayName: '姓名',
          type: 'string',
          nullable: false,
          required: true,
          description: '用户姓名'
        }
      ];
      const result = buildFieldTree(fields);

      expect(result[0].required).toBe(true);
      expect(result[0].description).toBe('用户姓名');
    });

    it('应该正确处理枚举字段', () => {
      const fields: FieldMetadata[] = [
        {
          name: 'status',
          displayName: '状态',
          type: 'string',
          nullable: false,
          enum: ['active', 'inactive', 'pending']
        }
      ];
      const result = buildFieldTree(fields);

      expect(result[0].enum).toEqual(['active', 'inactive', 'pending']);
    });

    it('应该正确处理 relationFields', () => {
      const relationFields: FieldMetadata[] = [
        { name: 'id', displayName: 'ID', type: 'string', nullable: false },
        { name: 'name', displayName: '名称', type: 'string', nullable: false }
      ];
      const fields: FieldMetadata[] = [
        {
          name: 'orders',
          displayName: '订单',
          type: 'relation',
          isRelation: true,
          relationFields
        }
      ];
      const result = buildFieldTree(fields);

      expect(result[0].relationFields).toEqual(relationFields);
    });

    it('应该为关系字段添加存在性检查选项', () => {
      const fields: FieldMetadata[] = [
        { name: 'orders', displayName: '订单', type: 'relation', isRelation: true },
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false }
      ];
      const result = buildFieldTree(fields);

      const ordersNode = result.find(n => n.label === 'orders');
      const existsOption = ordersNode?.children?.find(child => child.label === '__exists__');
      expect(existsOption).toBeDefined();
      expect(existsOption?.displayName).toBe('(存在性检查)');
    });

    it('应该为可空 keyValue 字段添加空值检查选项', () => {
      const fields: FieldMetadata[] = [
        { name: 'profile', displayName: '个人信息', type: 'keyValue', nullable: true },
        { name: 'profile.age', displayName: '个人信息.年龄', type: 'number', nullable: false },
        { name: 'profile.email', displayName: '个人信息.邮箱', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);

      const profileNode = result.find(n => n.label === 'profile');
      expect(profileNode).toBeDefined();
      expect(profileNode?.type).toBe('keyValue');
      expect(profileNode?.children).toBeDefined();

      const nullCheckOption = profileNode?.children?.find(child => child.label === '__null_check__');
      expect(nullCheckOption).toBeDefined();
      expect(nullCheckOption?.displayName).toBe('(空值检查)');
      expect(nullCheckOption?.type).toBe('keyValue');
      expect(nullCheckOption?.isNullCheckOption).toBe(true);
      expect(nullCheckOption?.value).toBe('profile');
    });

    it('不应该为不可空 keyValue 字段添加空值检查选项', () => {
      const fields: FieldMetadata[] = [
        { name: 'profile', displayName: '个人信息', type: 'keyValue', nullable: false },
        { name: 'profile.age', displayName: '个人信息.年龄', type: 'number', nullable: false }
      ];
      const result = buildFieldTree(fields);

      const profileNode = result.find(n => n.label === 'profile');
      const nullCheckOption = profileNode?.children?.find(child => child.label === '__null_check__');
      expect(nullCheckOption).toBeUndefined();
    });

    it('应该正确嵌套 keyValue 子属性', () => {
      const fields: FieldMetadata[] = [
        { name: 'profile', displayName: '个人信息', type: 'keyValue', nullable: true },
        { name: 'profile.age', displayName: '个人信息.年龄', type: 'number', nullable: false },
        { name: 'profile.email', displayName: '个人信息.邮箱', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);

      const profileNode = result.find(n => n.label === 'profile');
      // children = [null_check_option, age, email]
      const leafChildren = profileNode?.children?.filter(c => c.label !== '__null_check__') ?? [];
      expect(leafChildren).toHaveLength(2);
      expect(leafChildren.find(c => c.label === 'age')?.type).toBe('number');
      expect(leafChildren.find(c => c.label === 'email')?.type).toBe('string');
    });

    it('应该处理带 displayName 路径的嵌套字段', () => {
      const fields: FieldMetadata[] = [
        { name: 'orders.items.productName', displayName: '订单.项.商品名称', type: 'string', nullable: false }
      ];
      const result = buildFieldTree(fields);

      // 应该正确提取显示名
      const ordersNode = result[0];
      // orders 是虚拟节点，显示名从 pathToDisplayName 映射获取
      expect(ordersNode.displayName).toBe('订单');
    });
  });

  describe('findNodeByValue', () => {
    it('应该在树中查找节点', () => {
      const fields: FieldMetadata[] = [
        { name: 'name', displayName: '姓名', type: 'string', nullable: false },
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false }
      ];
      const tree = buildFieldTree(fields);

      const found = findNodeByValue(tree, 'orders.amount');
      expect(found).toBeDefined();
      expect(found?.displayName).toBe('金额');
    });

    it('应该返回 undefined 当节点不存在', () => {
      const fields: FieldMetadata[] = [{ name: 'name', displayName: '姓名', type: 'string', nullable: false }];
      const tree = buildFieldTree(fields);

      const found = findNodeByValue(tree, 'nonExistent');
      expect(found).toBeUndefined();
    });

    it('应该递归查找子节点', () => {
      const fields: FieldMetadata[] = [{ name: 'a.b.c.d', displayName: 'A.B.C.D', type: 'string', nullable: false }];
      const tree = buildFieldTree(fields);

      const found = findNodeByValue(tree, 'a.b.c.d');
      expect(found).toBeDefined();
      expect(found?.label).toBe('d');
    });
  });

  describe('createFieldNodeMap', () => {
    it('应该创建字段到节点的映射', () => {
      const fields: FieldMetadata[] = [
        { name: 'name', displayName: '姓名', type: 'string', nullable: false },
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false }
      ];
      const tree = buildFieldTree(fields);
      const map = createFieldNodeMap(tree);

      expect(map.get('name')).toBeDefined();
      expect(map.get('orders')).toBeDefined();
      expect(map.get('orders.amount')).toBeDefined();
    });

    it('应该包含所有嵌套节点', () => {
      const fields: FieldMetadata[] = [{ name: 'a.b.c', displayName: 'A.B.C', type: 'string', nullable: false }];
      const tree = buildFieldTree(fields);
      const map = createFieldNodeMap(tree);

      expect(map.size).toBe(3);
      expect(map.get('a')).toBeDefined();
      expect(map.get('a.b')).toBeDefined();
      expect(map.get('a.b.c')).toBeDefined();
    });
  });

  describe('getOptionGroupChildren', () => {
    it('应该返回 children 数组', () => {
      const result = getOptionGroupChildren();
      expect(result).toHaveLength(10);
      expect(result.every(s => s === 'children')).toBe(true);
    });

    it('应该支持自定义深度', () => {
      const result = getOptionGroupChildren(3);
      expect(result).toHaveLength(3);
    });
  });

  describe('getDisplayNamePath', () => {
    it('应该返回完整的显示名路径', () => {
      const fields: FieldMetadata[] = [
        { name: 'orders.createdAt', displayName: '订单.创建时间', type: 'date', nullable: false }
      ];
      const tree = buildFieldTree(fields);

      const path = getDisplayNamePath(tree, 'orders.createdAt');
      expect(path).toBe('订单.创建时间');
    });

    it('应该处理不存在的节点', () => {
      const fields: FieldMetadata[] = [{ name: 'name', displayName: '姓名', type: 'string', nullable: false }];
      const tree = buildFieldTree(fields);

      const path = getDisplayNamePath(tree, 'non.existent');
      expect(path).toBe('non.existent');
    });

    it('应该处理只有顶层节点的情况', () => {
      const fields: FieldMetadata[] = [{ name: 'name', displayName: '姓名', type: 'string', nullable: false }];
      const tree = buildFieldTree(fields);

      const path = getDisplayNamePath(tree, 'name');
      expect(path).toBe('姓名');
    });
  });

  describe('flattenFieldTree', () => {
    const leaf = (label: string, value: string, displayName = label): FieldTreeNode => ({
      label,
      value,
      displayName,
      type: 'string',
      isRelation: false
    });

    it('flattens leaf nodes', () => {
      const tree: FieldTreeNode[] = [leaf('name', 'name', '姓名'), leaf('age', 'age', '年龄')];
      expect(flattenFieldTree(tree)).toEqual([
        { value: 'name', label: '姓名' },
        { value: 'age', label: '年龄' }
      ]);
    });

    it('prefers displayName and falls back to label', () => {
      const noDisplay = leaf('x', 'x', '');
      expect(flattenFieldTree([noDisplay])).toEqual([{ value: 'x', label: 'x' }]);
    });

    it('recurses into children with a prefixed label', () => {
      const tree: FieldTreeNode[] = [
        {
          ...leaf('orders', 'orders', '订单'),
          children: [leaf('id', 'orders.id', 'ID'), leaf('total', 'orders.total', '金额')]
        }
      ];
      expect(flattenFieldTree(tree)).toEqual([
        { value: 'orders.id', label: '订单 › ID' },
        { value: 'orders.total', label: '订单 › 金额' }
      ]);
    });

    it('supports a custom separator', () => {
      const tree: FieldTreeNode[] = [
        { ...leaf('orders', 'orders', '订单'), children: [leaf('id', 'orders.id', 'ID')] }
      ];
      expect(flattenFieldTree(tree, ' > ')).toEqual([{ value: 'orders.id', label: '订单 > ID' }]);
    });

    it('skips leaf nodes without a value', () => {
      const empty: FieldTreeNode = { label: 'empty', value: '', displayName: '空', type: 'string', isRelation: false };
      expect(flattenFieldTree([empty])).toEqual([]);
    });

    it('handles nested children without value but with further children', () => {
      const tree: FieldTreeNode[] = [
        {
          label: 'root',
          value: '',
          displayName: '根',
          type: 'string',
          isRelation: false,
          children: [leaf('id', 'id', 'ID')]
        }
      ];
      expect(flattenFieldTree(tree)).toEqual([{ value: 'id', label: '根 › ID' }]);
    });
  });
});
