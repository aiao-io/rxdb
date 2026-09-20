/**
 * @fileoverview 字段树工具函数
 *
 * 提供 Angular/React/Vue 共享的字段树构建和查找功能。
 * 用于将扁平的 FieldMetadata[] 转换为 CascadeSelect 组件所需的树形结构。
 */

import type { FieldMetadata, PropertyType } from '../models/query-builder-state.js';

const EXISTS_OPTION_LABEL = '__exists__';
const NULL_CHECK_OPTION_LABEL = '__null_check__';

/** 计算字符串中 '.' 的数量（避免使用 regex.match 开销） */
function countDots(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 46 /* '.' */) count++;
  }
  return count;
}

/**
 * 字段树节点（用于 CascadeSelect）
 *
 * @description
 * 将扁平的 FieldMetadata[] 转换为树形结构，
 * 以便 CascadeSelect 组件级联展示嵌套字段。
 */
export interface FieldTreeNode {
  /** 当前层的字段名 */
  label: string;
  /** 完整路径（作为选中值） */
  value: string;
  /** 显示名称 */
  displayName: string;
  /** 字段类型 */
  type: PropertyType;
  /** 是否是关系字段 */
  isRelation: boolean;
  /** 子节点 */
  children?: FieldTreeNode[];
  /** 字段描述 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
  /** 枚举值 */
  enum?: unknown[];
  /** 关系目标实体的字段列表（用于 EXISTS 子查询） */
  relationFields?: FieldMetadata[];
  /** 是否是存在性检查选项（用于解决重复 key 问题） */
  isExistsOption?: boolean;
  /** 是否是空值检查选项（keyValue 字段的整体空值查询） */
  isNullCheckOption?: boolean;
}

/**
 * 将扁平字段列表转换为树结构
 *
 * @description
 * 将 `orders.items.productName` 这样的扁平路径转换为嵌套树结构：
 * ```
 * orders
 * └── items
 *     └── productName
 * ```
 *
 * @param fields 扁平的字段元数据列表
 * @returns 树形结构的字段节点
 *
 * @example
 * ```ts
 * const fields = [
 *   { name: 'name', displayName: '姓名', type: 'string' },
 *   { name: 'orders', displayName: '订单', type: 'relation' },
 *   { name: 'orders.amount', displayName: '订单.金额', type: 'number' }
 * ];
 * const tree = buildFieldTree(fields);
 * // tree[0] = { label: 'name', displayName: '姓名', ... }
 * // tree[1] = { label: 'orders', displayName: '订单', children: [...] }
 * ```
 */
export function buildFieldTree(fields: FieldMetadata[]): FieldTreeNode[] {
  // 去重：相同 name 的字段只保留第一个
  const seen = new Set<string>();
  const uniqueFields = fields.filter(f => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });

  const root: FieldTreeNode[] = [];
  const nodeMap = new Map<string, FieldTreeNode>();

  // 按深度排序，确保父节点先创建（预先计算深度避免重复 regex 匹配）
  const depthCache = new Map<FieldMetadata, number>();
  for (const field of uniqueFields) {
    depthCache.set(field, countDots(field.name));
  }
  const sorted = [...uniqueFields].sort((a, b) => (depthCache.get(a) ?? 0) - (depthCache.get(b) ?? 0));

  // 预处理：构建路径到显示名的映射（用于虚拟节点）
  const pathToDisplayName = new Map<string, string>();
  for (const field of uniqueFields) {
    // 从 displayName 中提取各级显示名
    // 例如 "订单.订单项.商品名称" → { "orders": "订单", "orders.items": "订单项" }
    if (field.displayName) {
      const nameParts = field.name.split('.');
      const displayParts = field.displayName.split('.');
      let path = '';
      for (let i = 0; i < nameParts.length - 1; i++) {
        path = path ? `${path}.${nameParts[i]}` : nameParts[i];
        if (displayParts[i] && !pathToDisplayName.has(path)) {
          pathToDisplayName.set(path, displayParts[i]);
        }
      }
    }
  }

  for (const field of sorted) {
    const parts = field.name.split('.');
    const key = parts[parts.length - 1];
    const isRelation = field.type === 'relation' || !!field.isRelation;

    // 从 displayName 中提取最后一部分作为节点显示名
    const displayParts = (field.displayName ?? key).split('.');
    const nodeDisplayName = displayParts[displayParts.length - 1] || key;

    const node: FieldTreeNode = {
      label: key,
      value: field.name,
      displayName: nodeDisplayName,
      type: field.type,
      isRelation,
      description: field.description,
      required: field.required,
      enum: field.enum,
      // 关系字段复制 relationFields 用于子查询
      ...(field.relationFields && { relationFields: field.relationFields })
    };

    nodeMap.set(field.name, node);

    if (parts.length === 1) {
      // 顶层字段
      root.push(node);
    } else {
      // 嵌套字段，找父节点
      const parentPath = parts.slice(0, -1).join('.');
      const parentNode = nodeMap.get(parentPath);

      if (parentNode) {
        parentNode.children = parentNode.children ?? [];
        parentNode.children.push(node);
      } else {
        // 父节点不存在，创建虚拟父节点链
        let currentPath = '';
        let currentParent = root;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          currentPath = currentPath ? `${currentPath}.${part}` : part;

          let existingNode = nodeMap.get(currentPath);
          if (!existingNode) {
            // 尝试从预处理映射中获取显示名
            const virtualDisplayName = pathToDisplayName.get(currentPath) ?? part;
            existingNode = {
              label: part,
              value: currentPath,
              displayName: virtualDisplayName,
              type: 'relation',
              isRelation: true,
              children: []
            };
            nodeMap.set(currentPath, existingNode);
            currentParent.push(existingNode);
          }

          existingNode.children = existingNode.children ?? [];
          currentParent = existingNode.children;
        }

        currentParent.push(node);
      }
    }
  }

  // 后处理：为有子节点的关系字段添加「存在性检查」(EXISTS) 选项，
  // 为有子节点且可空的 keyValue 字段添加「空值检查」选项。
  // 由于 CascadeSelect 中有子节点的项只能展开、不能直接被选中，
  // 这里为每个需要的父节点追加一个特殊子节点，以便用户可以选择
  // 「该关系是否存在」或「该 keyValue 是否为空」。
  const fieldMap = new Map<string, FieldMetadata>();
  for (const f of uniqueFields) fieldMap.set(f.name, f);
  addSpecialOptionsToNodes(root, fieldMap);

  return root;
}

/**
 * 为有子节点的关系/keyValue 字段添加特殊选项
 *
 * @description
 * CascadeSelect 组件中，有子节点的项无法直接选择（只能展开）。
 * - 关系字段：添加"存在性检查"选项，让用户可以进行 EXISTS 查询
 * - keyValue 字段（可空时）：添加"空值检查"选项，让用户可以查询整体是否为空
 *
 * @param nodes 树节点列表
 * @param fields 原始字段元数据列表
 */
function addSpecialOptionsToNodes(nodes: FieldTreeNode[], fieldMap: Map<string, FieldMetadata>): void {
  for (const node of nodes) {
    const children = node.children;
    if (children && children.length > 0) {
      // 关系节点：添加"存在性检查"选项
      if (node.isRelation && !children.some(child => child.label === EXISTS_OPTION_LABEL)) {
        children.unshift({
          label: EXISTS_OPTION_LABEL,
          value: node.value,
          displayName: '(存在性检查)',
          type: 'relation',
          isRelation: true,
          isExistsOption: true,
          description: `检查 ${node.displayName} 是否存在`,
          relationFields: fieldMap.get(node.value)?.relationFields
        });
      }

      // keyValue 节点（可空）：添加"空值检查"选项
      if (node.type === 'keyValue' && fieldMap.get(node.value)?.nullable) {
        if (!children.some(child => child.label === NULL_CHECK_OPTION_LABEL)) {
          children.unshift({
            label: NULL_CHECK_OPTION_LABEL,
            value: node.value,
            displayName: '(空值检查)',
            type: 'keyValue',
            isRelation: false,
            isNullCheckOption: true,
            description: `检查 ${node.displayName} 是否为空`
          });
        }
      }

      // 递归处理子节点
      addSpecialOptionsToNodes(children, fieldMap);
    }
  }
}

/**
 * 将字段树展平为选项列表
 *
 * @param nodes 字段树节点
 * @param separator 层级分隔符（默认 ' › '）
 * @param prefix 前缀路径（递归用）
 * @returns 展平的选项列表
 */
export function flattenFieldTree(
  nodes: FieldTreeNode[],
  separator = ' › ',
  prefix = ''
): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [];
  collectFlattened(nodes, separator, prefix, result);
  return result;
}

function collectFlattened(
  nodes: FieldTreeNode[],
  separator: string,
  prefix: string,
  out: Array<{ value: string; label: string }>
): void {
  for (const node of nodes) {
    const display = node.displayName || node.label;
    const label = prefix ? `${prefix}${separator}${display}` : display;
    if (node.children?.length) {
      collectFlattened(node.children, separator, label, out);
    } else if (node.value) {
      out.push({ value: node.value, label });
    }
  }
}

/**
 * 在树中查找节点
 *
 * @param nodes 树节点列表
 * @param value 要查找的值（完整路径）
 * @returns 找到的节点或 undefined
 *
 * @example
 * ```ts
 * const node = findNodeByValue(tree, 'orders.items.productName');
 * console.log(node?.displayName); // '商品名称'
 * ```
 */
export function findNodeByValue(nodes: FieldTreeNode[], value: string): FieldTreeNode | undefined {
  for (const node of nodes) {
    if (node.value === value) {
      return node;
    }
    if (node.children) {
      const found = findNodeByValue(node.children, value);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * 创建字段名到节点的映射
 *
 * @description
 * 递归遍历树结构，创建一个 Map 用于快速查找节点。
 * 对于需要频繁查找的场景，比直接递归更高效。
 *
 * @param tree 字段树
 * @returns 字段名到节点的映射
 *
 * @example
 * ```ts
 * const nodeMap = createFieldNodeMap(tree);
 * const node = nodeMap.get('orders.amount');
 * ```
 */
export function createFieldNodeMap(tree: FieldTreeNode[]): Map<string, FieldTreeNode> {
  const map = new Map<string, FieldTreeNode>();

  const collectNodes = (nodes: FieldTreeNode[]) => {
    for (const node of nodes) {
      map.set(node.value, node);
      if (node.children) {
        collectNodes(node.children);
      }
    }
  };

  collectNodes(tree);
  return map;
}

/**
 * 获取 CascadeSelect 的 optionGroupChildren 配置
 *
 * @description
 * CascadeSelect 需要知道每一层的子节点属性名。
 * 由于我们统一使用 'children'，返回重复的 ['children', 'children', ...]
 * 深度根据最大嵌套层级决定。
 *
 * @param maxDepth 最大深度，默认 10
 * @returns children 属性名数组
 */
export function getOptionGroupChildren(maxDepth = 10): string[] {
  return Array(maxDepth).fill('children');
}

/**
 * 获取完整的 displayName 路径
 *
 * @description
 * 给定字段路径（如 `orders.createdAt`），返回完整的显示名路径（如 `订单.创建时间`）。
 * 通过遍历树结构，将每一级的 displayName 拼接起来。
 *
 * @param tree 字段树
 * @param value 字段路径（如 `orders.createdAt`）
 * @returns 显示名路径（如 `订单.创建时间`）
 *
 * @example
 * ```ts
 * const displayPath = getDisplayNamePath(tree, 'orders.createdAt');
 * console.log(displayPath); // '订单.创建时间'
 * ```
 */
export function getDisplayNamePath(tree: FieldTreeNode[], value: string): string {
  const parts = value.split('.');
  const displayParts: string[] = [];
  let currentLevel: FieldTreeNode[] = tree;
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    currentPath = currentPath ? `${currentPath}.${parts[i]}` : parts[i];
    // 在当前层级使用单次线性查找（通常子节点数量较少）
    let found: FieldTreeNode | undefined;
    for (const n of currentLevel) {
      if (n.value === currentPath) {
        found = n;
        break;
      }
    }
    if (found) {
      displayParts.push(found.displayName || found.label);
      currentLevel = found.children ?? [];
    } else {
      displayParts.push(parts[i]);
    }
  }

  return displayParts.join('.');
}
