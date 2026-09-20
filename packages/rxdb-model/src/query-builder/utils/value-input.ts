import { UUID_RE } from '../../entity-value.utils.js';
import type { OperatorDefinition } from '../models/operator.interface.js';
import type { PropertyType } from '../models/query-builder-state.js';
import type { OperatorRegistry } from '../services/operator-registry.service.js';
import { getDefaultOperatorRegistry } from '../services/operator-registry.service.js';

/** 标准 UUID 格式正则（8-4-4-4-12 十六进制，忽略大小写），重新导出供校验使用 */
export { UUID_RE };

/**
 * 根据字段类型和运算符确定查询条件值的输入控件类型。
 *
 * @param fieldType 字段类型（如 'string'、'number'、'date'、'enum' 等）
 * @param operator 运算符 key（如 'between'、'in'、'null' 等）
 * @param enumOptions 字段的枚举选项列表
 * @param operatorRegistry 运算符注册表（默认使用全局默认注册表）
 * @returns 输入控件类型标识（如 'string'、'number'、'boolean'、'date'、'range'、'array'、'enum'、'enum-array'、'subquery'、'uuid'、'none'）
 */
export function getInputType(
  fieldType: string,
  operator: string,
  enumOptions?: unknown[],
  operatorRegistry: OperatorRegistry = getDefaultOperatorRegistry()
): string {
  if (operator === 'null' || operator === 'notNull') return 'none';

  const operators = operatorRegistry.getForType(fieldType as PropertyType) || [];
  const op = operators.find((o: OperatorDefinition) => o.key === operator);

  if (op?.valueType === 'none') return 'none';
  if (op?.valueType === 'subquery') return 'subquery';
  if (operator === 'between' || operator === 'notBetween') return 'range';
  if (operator === 'in' || operator === 'notIn') {
    if ((enumOptions && enumOptions.length > 0) || fieldType === 'enum') return 'enum-array';
    return 'array';
  }
  if (enumOptions && enumOptions.length > 0) return 'enum';

  switch (fieldType) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
      return 'number';
    case 'date':
    case 'date-time':
      return 'date';
    case 'array':
      return 'array';
    case 'enum':
      return 'enum';
    case 'uuid':
      return 'uuid';
    default:
      return 'string';
  }
}

/**
 * 返回指定输入控件类型的默认值。
 *
 * @param type 输入控件类型（getInputType 的返回值）
 * @returns 对应类型的默认值：boolean 为 false、range/array/enum-array 为 []、subquery 为 undefined、none/number/date 为 null、其余为 ''
 */
export function getDefaultValueForType(type: string): unknown {
  switch (type) {
    case 'none':
      return null;
    case 'boolean':
      return false;
    case 'number':
      return null;
    case 'date':
      return null;
    case 'range':
      return [];
    case 'array':
      return [];
    case 'enum-array':
      return [];
    case 'subquery':
      return undefined;
    default:
      return '';
  }
}

/**
 * 将逗号分隔的字符串解析为数组。
 * 当 fieldType 为 'number' 时返回数字数组，否则返回字符串数组。
 *
 * @param text 逗号分隔的字符串
 * @param fieldType 字段类型；为 'number' 时各项解析为数字并过滤无效值
 * @returns 解析后的数组（空白项被过滤）
 */
export function parseCommaSeparatedInput(text: string, fieldType: string): unknown[] {
  const items = text
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  if (fieldType === 'number') {
    return items.map(s => Number(s)).filter(n => !isNaN(n));
  }
  return items;
}
