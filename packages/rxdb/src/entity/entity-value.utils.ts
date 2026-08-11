/**
 * @packageDocumentation
 * 实体值处理工具模块
 * 提供字段值解析、格式化、验证等功能
 */
import type { EntityFieldConfig, EntityFieldType } from './entity-field.utils.js';
import type { PropertyType } from './metadata-options.interface.js';

/**
 * {@link EntityFieldType} 的字符串字面量视图。
 *
 * @remarks
 * `PropertyType` 是字符串枚举，直接用 {@link EntityFieldType} 做参数类型会拒绝 `'date'` 这类
 * 字面量，逼所有调用方 import 枚举——对公开工具是无谓的破坏性变更。模板字面量类型取出枚举的
 * 字符串值集合，既接受枚举成员也接受等价字面量，同时仍然拒绝枚举外的任意字符串。
 */
export type EntityFieldTypeName = `${PropertyType}` | 'oneToOne' | 'manyToOne' | 'computed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 按字段类型把原始值规范化成实体侧的运行时表示。
 *
 * @param type - 封闭集合 {@link EntityFieldTypeName}。不接受任意字符串：未知值一律抛错，
 * 避免配置拼写错误、生成器版本漂移或新增枚举未实现被伪装成"解析成功"。
 * @param raw - 原始值；`null` 与空串统一归一化为 `null`
 * @throws 当 `type` 不是 {@link EntityFieldTypeName} 的成员时抛出，错误信息带上该类型名
 */
export function parseEntityFieldValue(type: EntityFieldTypeName, raw: unknown): unknown {
  if (raw == null || raw === '') return null;

  switch (type) {
    // 已规范化的透传类型：显式列出而不是靠 default 兜底，
    // 新增枚举成员时才能在这里暴露出"未实现"而不是被静默放行
    case 'string':
    case 'bigint':
    case 'binary':
      return raw;
    case 'uuid':
      return String(raw).toLowerCase().trim();
    case 'enum':
      return raw === '' ? null : String(raw);
    case 'number': {
      const n = Number(raw);
      return isNaN(n) ? null : n;
    }
    case 'integer': {
      const n = parseInt(String(raw), 10);
      return isNaN(n) ? null : n;
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === '1';
    case 'date': {
      // 返回 Date 而不是 ISO 字符串：`PropertyType.date` 的运行时契约就是 Date
      // （见 `EntityBase.createdAt!: Date`）。返回字符串后写回实体，
      // `isEqual(string, Date)` 恒为 false —— 每次比较都产生假 diff，
      // 每次 save 都重复写回同一列。
      const d = raw instanceof Date ? raw : new Date(raw as string | number);
      return isNaN(d.getTime()) ? null : d;
    }
    case 'stringArray':
      if (Array.isArray(raw)) return (raw as unknown[]).map(String);
      return String(raw)
        .split(',')
        .map(x => x.trim())
        .filter(x => x !== '');
    case 'numberArray':
      if (Array.isArray(raw)) return (raw as unknown[]).map(Number).filter(n => !isNaN(n));
      return String(raw)
        .split(',')
        .map(x => Number(x.trim()))
        .filter(n => !isNaN(n));
    case 'keyValue':
    case 'json':
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch {
        return null;
      }
    case 'oneToOne':
    case 'manyToOne':
      return raw === '' ? null : String(raw);
    case 'computed':
      return raw;
    default:
      throw new TypeError(`parseEntityFieldValue: 未知字段类型 '${String(type)}'`);
  }
}

export function formatEntityFieldValue(type: EntityFieldType | string, value: unknown): string {
  if (value == null || value === '') return '';

  switch (type) {
    case 'date': {
      const d = value instanceof Date ? value : new Date(value as string | number);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    }
    case 'boolean':
      return value ? 'true' : 'false';
    case 'stringArray':
    case 'numberArray':
      return Array.isArray(value) ? (value as unknown[]).join(', ') : String(value);
    case 'keyValue':
    case 'json':
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }
      return String(value);
    default:
      return String(value);
  }
}

export interface FieldValidationError {
  field: string;
  message: string;
}

export function validateEntityFieldValue(field: EntityFieldConfig, value: unknown): FieldValidationError | null {
  if (field.required) {
    if (value == null || value === '') return { field: field.field, message: `${field.displayName} 是必填项` };
    if (Array.isArray(value) && value.length === 0)
      return { field: field.field, message: `${field.displayName} 是必填项` };
  }

  if (value == null || value === '') return null;

  switch (field.type) {
    case 'uuid':
      if (!UUID_RE.test(String(value))) return { field: field.field, message: `${field.displayName} 格式不正确` };
      break;
    case 'number':
    case 'integer':
      if (isNaN(Number(value))) return { field: field.field, message: `${field.displayName} 必须是数字` };
      if (field.type === 'integer' && !Number.isInteger(Number(value)))
        return { field: field.field, message: `${field.displayName} 必须是整数` };
      break;
    case 'date': {
      const d = value instanceof Date ? value : new Date(value as string | number);
      if (isNaN(d.getTime())) return { field: field.field, message: `${field.displayName} 日期格式不正确` };
      break;
    }
    case 'enum':
      if (field.enumValues && !field.enumValues.includes(String(value))) {
        return { field: field.field, message: `${field.displayName} 值不在允许范围内` };
      }
      break;
    case 'json':
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
        } catch {
          return { field: field.field, message: `${field.displayName} JSON 格式不正确` };
        }
      }
      break;
  }

  return null;
}
