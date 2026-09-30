/**
 * @fileoverview 字段选择器组件（Angular `FieldSelectorComponent` 的 React 移植）。
 *
 * 使用 {@link TreeSelect} 展示树形字段结构，支持过滤和嵌套关系字段的展开/折叠；
 * 不依赖任何第三方 UI 库。Angular 侧的 `fieldChange` output 与 `fieldChangeFn` input
 * 在 React 合并为单一 `onFieldChange` 回调 prop（语义等价）。
 *
 * @module query-builder/field-selector
 */
import { buildFieldTree, type FieldMetadata } from '@aiao/rxdb-model';
import { useMemo, type JSX } from 'react';
import { TreeSelect } from '../tree-select/tree-select';

/** {@link FieldSelector} 的 props。 */
export interface FieldSelectorProps {
  /** 可用字段列表。 */
  fields: FieldMetadata[];
  /** 当前选中字段。 */
  selectedField?: string;
  /** 占位文案，缺省 `'选择字段'`。 */
  placeholder?: string;
  /** 选中回调。 */
  onFieldChange?: (field: string) => void;
}

/**
 * 字段选择器组件：树形字段结构 + 过滤 + 关系字段展开/折叠。
 */
export function FieldSelector({
  fields,
  selectedField = '',
  placeholder = '选择字段',
  onFieldChange
}: FieldSelectorProps): JSX.Element {
  const fieldTree = useMemo(() => buildFieldTree(fields), [fields]);

  return (
    <TreeSelect
      nodes={fieldTree}
      placeholder={placeholder}
      selected={selectedField}
      onSelectChange={value => onFieldChange?.(value)}
      minWidth='14rem'
    />
  );
}
