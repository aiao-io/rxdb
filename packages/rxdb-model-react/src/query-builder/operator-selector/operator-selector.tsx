/**
 * @fileoverview 操作符选择器组件（Angular `OperatorSelectorComponent` 的 React 移植）。
 *
 * 基于 {@link PopoverSelect} 提供操作符选择功能，自动根据字段类型或元数据筛选可用操作符；
 * 支持搜索过滤和键盘导航。Angular 侧的 `operatorChange` output 与 `operatorChangeFn` input
 * 在 React 合并为单一 `onOperatorChange` 回调 prop（语义等价）。
 *
 * @module query-builder/operator-selector
 */
import { getDefaultOperatorRegistry, type FieldMetadata, type PropertyType } from '@aiao/rxdb-model';
import { useMemo, type JSX } from 'react';
import { PopoverSelect } from '../popover-select/popover-select';

/** {@link OperatorSelector} 的 props。 */
export interface OperatorSelectorProps {
  /** 字段元数据（优先于 fieldType 推导操作符）。 */
  fieldMetadata?: FieldMetadata;
  /** 字段类型（无元数据时按类型推导操作符），缺省 `'string'`。 */
  fieldType?: string;
  /** 当前选中操作符，缺省 `'='`。 */
  selectedOperator?: string;
  /** 选中回调。 */
  onOperatorChange?: (operator: string) => void;
}

/**
 * 操作符选择器组件：按字段元数据 / 类型从操作符注册表推导可选项。
 */
export function OperatorSelector({
  fieldMetadata,
  fieldType = 'string',
  selectedOperator = '=',
  onOperatorChange
}: OperatorSelectorProps): JSX.Element {
  const registry = useMemo(() => getDefaultOperatorRegistry(), []);

  const operatorOptions = useMemo(() => {
    const operators =
      fieldMetadata ? registry.getForField(fieldMetadata) : registry.getForType(fieldType as PropertyType);
    return operators.map(operator => ({ value: operator.key, label: operator.label }));
  }, [registry, fieldMetadata, fieldType]);

  return (
    <PopoverSelect
      options={operatorOptions}
      selected={selectedOperator}
      onSelectChange={operator => onOperatorChange?.(operator)}
      minWidth='8rem'
      placeholder='选择操作符'
    />
  );
}
