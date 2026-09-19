import type { EntityFieldConfig, EntityFieldType } from './entity-field.utils.js';

/**
 * RxDB Model 实体值处理工具模块
 * 提供实体字段值的解析、格式化、验证等功能
 * @module entity-value.utils
 */

/**
 * UUID 字符串格式校验正则（不区分大小写）
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 将原始值解析为 ISO 格式的日期字符串
 * @remarks 解析失败时返回 null
 */
function parseDate(raw: unknown): string | null {
  const d = raw instanceof Date ? raw : new Date(raw as string | number);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 将原始值解析为字符串数组
 * @remarks 非数组输入按逗号分隔解析，空白项会被忽略
 */
function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return (raw as unknown[]).map(String);
  const result: string[] = [];
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim();
    if (trimmed !== '') result.push(trimmed);
  }
  return result;
}

/**
 * 将原始值解析为数字数组
 * @remarks 非数组输入按逗号分隔解析，无法转换为数字的项会被丢弃
 */
function parseNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const out: number[] = [];
    for (const v of raw as unknown[]) {
      const n = Number(v);
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }
  const out: number[] = [];
  for (const part of String(raw).split(',')) {
    const n = Number(part.trim());
    if (!isNaN(n)) out.push(n);
  }
  return out;
}

/**
 * 将原始值解析为 JSON 类值（keyValue / json 字段共用）
 * @remarks 对象原样返回，字符串按 JSON 解析，失败时输出警告并返回 null
 */
function parseJsonLike(type: string, raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    console.warn(`[rxdb-model] Failed to parse ${type} value for field:`, raw);
    return null;
  }
}

/**
 * 将原始值解析为指定字段类型的目标值
 * @remarks 空值（null / undefined / 空字符串）统一返回 null，未识别的类型原样返回
 * @param type - 字段类型
 * @param raw - 原始值
 * @returns 解析后的值
 */
export function parseEntityFieldValue(type: EntityFieldType | string, raw: unknown): unknown {
  if (raw == null || raw === '') return null;

  switch (type) {
    case 'uuid':
      return String(raw).toLowerCase().trim();
    case 'enum':
    case 'oneToOne':
    case 'manyToOne':
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
    case 'date':
      return parseDate(raw);
    case 'stringArray':
      return parseStringArray(raw);
    case 'numberArray':
      return parseNumberArray(raw);
    case 'keyValue':
    case 'json':
      return parseJsonLike(type, raw);
    case 'computed':
    default:
      return raw;
  }
}

/**
 * 将字段值格式化为展示用字符串
 * @remarks 日期按本地格式展示，数组以逗号加空格连接，JSON 类值序列化为 JSON 字符串
 * @param type - 字段类型
 * @param value - 字段值
 * @returns 格式化后的字符串
 */
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

/**
 * 字段校验错误
 */
export interface FieldValidationError {
  /** 出错字段名 */
  field: string;
  /** 错误提示信息 */
  message: string;
}

/**
 * 校验单个字段值是否满足字段配置约束
 * @remarks 校验必填、UUID 格式、数字 / 整数、日期、枚举范围与 JSON 格式
 * @param field - 字段配置
 * @param value - 待校验的字段值
 * @returns 校验错误；校验通过时返回 null
 */
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
