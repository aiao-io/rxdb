import type { FieldFormat } from '@aiao/rxdb';
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

/** 有符号 64 位整数字面量（十进制） */
const BIGINT_RE = /^[+-]?\d+$/;

/** 偶数长度的十六进制字节串 */
const HEX_BYTES_RE = /^(?:[0-9a-fA-F]{2})*$/;

/**
 * 将原始值解析为 bigint
 * @remarks 原生 bigint 原样返回；整数数字与整数字符串转 bigint；其余返回 null
 */
function parseBigint(raw: unknown): bigint | null {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    return BIGINT_RE.test(text) ? BigInt(text) : null;
  }
  if (typeof raw === 'number' && Number.isInteger(raw)) return BigInt(raw);
  return null;
}

/**
 * 将原始值解析为字节序列
 * @remarks Uint8Array 原样返回；字符串按十六进制解码（奇数长度或非 hex 字符返回 null）
 */
function parseBinary(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text === '' || text.length % 2 !== 0 || !HEX_BYTES_RE.test(text)) return null;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
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
    case 'bigint':
      return parseBigint(raw);
    case 'binary':
      return parseBinary(raw);
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
 * 严格解析表单输入；失败时返回结构化原因，调用方不得覆盖原始输入。
 */
export function parseEntityFieldValueStrict(
  type: EntityFieldType | string,
  raw: unknown
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (raw == null || raw === '') return { ok: true, value: null };
  if (type === 'integer' && typeof raw === 'string' && !/^[+-]?\d+$/.test(raw.trim())) {
    return { ok: false, message: '必须是整数' };
  }
  if (type === 'numberArray') {
    const values =
      Array.isArray(raw) ? raw : (
        String(raw)
          .split(',')
          .map(part => part.trim())
      );
    if (values.some(value => value === '' || !Number.isFinite(Number(value)))) {
      return { ok: false, message: '必须是数字数组' };
    }
  }
  if (type === 'json' || type === 'keyValue') {
    if (typeof raw === 'string') {
      try {
        JSON.parse(raw);
      } catch {
        return { ok: false, message: 'JSON 格式不正确' };
      }
    }
  }
  if (type === 'bigint' && typeof raw === 'string' && !BIGINT_RE.test(raw.trim())) {
    return { ok: false, message: '必须是大整数' };
  }
  if (type === 'binary' && typeof raw === 'string' && parseBinary(raw) === null) {
    return { ok: false, message: '必须是十六进制字节序列' };
  }
  let value: unknown;
  try {
    value = parseEntityFieldValue(type, raw);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  if ((type === 'number' || type === 'integer') && (value === null || !Number.isFinite(Number(value)))) {
    return { ok: false, message: type === 'integer' ? '必须是整数' : '必须是数字' };
  }
  if (type === 'integer' && !Number.isInteger(value)) return { ok: false, message: '必须是整数' };
  if (type === 'bigint' && typeof value !== 'bigint') return { ok: false, message: '必须是大整数' };
  if (type === 'binary' && !(value instanceof Uint8Array)) return { ok: false, message: '必须是十六进制字节序列' };
  if (type === 'date' && value === null) return { ok: false, message: '日期格式不正确' };
  return { ok: true, value };
}

/** 二进制列展示时完整展开的最大字节数，超过则截断为前缀 + 字节数。 */
const BINARY_PREVIEW_BYTES = 16;

/**
 * 将字节序列格式化为 hex 预览
 * @remarks 16 字节以内完整展开；更长时显示前 8 字节 hex + 总字节数
 */
function formatBinary(value: Uint8Array): string {
  if (value.length === 0) return '';
  const toHex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  if (value.length <= BINARY_PREVIEW_BYTES) return toHex(value);
  return `${toHex(value.slice(0, 8))}… (${value.length} bytes)`;
}

/** 百分比展示：`0..1` 刻度的值先放大 100 倍。 */
function formatPercentage(value: number, scale: '0..1' | '0..100'): string {
  return `${scale === '0..1' ? value * 100 : value}%`;
}

/**
 * 将字段值格式化为展示用字符串
 * @remarks 日期按本地格式展示，数组以逗号加空格连接，JSON 类值序列化为 JSON 字符串。
 * `format` 只影响展示形态：货币/百分比/评分/时长/日期显示模式
 * @param type - 字段类型
 * @param value - 字段值
 * @param format - 字段语义标注（可选）
 * @returns 格式化后的字符串
 */
export function formatEntityFieldValue(type: EntityFieldType | string, value: unknown, format?: FieldFormat): string {
  if (value == null || value === '') return '';

  switch (type) {
    case 'date': {
      const d = value instanceof Date ? value : new Date(value as string | number);
      if (isNaN(d.getTime())) return '';
      if (format?.kind === 'dateTime') {
        if (format.display === 'date') return d.toLocaleDateString();
        if (format.display === 'time') return d.toLocaleTimeString();
        return d.toLocaleString();
      }
      return d.toLocaleString();
    }
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return String(value);
    case 'binary':
      return value instanceof Uint8Array ? formatBinary(value) : String(value);
    case 'stringArray':
    case 'numberArray':
      return Array.isArray(value) ? (value as unknown[]).join(', ') : String(value);
    case 'number':
    case 'integer': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      switch (format?.kind) {
        case 'currency':
          return `${n} ${format.currency}`;
        case 'percentage':
          return formatPercentage(n, format.scale);
        case 'rating':
          return `${n} ★`;
        case 'duration':
          return `${n} ${format.unit}`;
        default:
          return String(value);
      }
    }
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

/** 邮箱：无空白、恰好一个 `@`、且域名部分含 `.`。 */
const isEmailText = (text: string): boolean => {
  if (/\s/.test(text)) return false;
  const parts = text.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.');
};

/** 电话：可选 `+` 前缀，其余仅数字、空格、括号与连字符，长度 3～32。 */
const isPhoneText = (text: string): boolean => text.length >= 3 && text.length <= 32 && /^\+?[\d ()-]+$/.test(text);

/** 十六进制颜色（允许省略 `#`）。 */
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;

/** 步长对齐判定容差：浮点除法残差小于它即视为对齐。 */
const STEP_TOLERANCE = 1e-8;

/** 值是否落在带步长的区间刻度上（min 为刻度原点）。 */
const isOnStep = (value: number, min: number, step: number): boolean => {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < STEP_TOLERANCE;
};

/**
 * 校验 format 的数字区间（min / max / step）
 * @returns 违规信息；无违规返回 null
 */
function validateFormatRange(
  displayName: string,
  value: number,
  min: number | undefined,
  max: number | undefined,
  step: number | undefined
): string | null {
  if (min !== undefined && value < min) return `${displayName} 必须不小于 ${min}`;
  if (max !== undefined && value > max) return `${displayName} 必须不大于 ${max}`;
  if (step !== undefined && min !== undefined && !isOnStep(value, min, step))
    return `${displayName} 必须按步长 ${step} 取值`;
  return null;
}

/**
 * 校验单个字段值是否满足字段配置约束
 * @remarks 校验必填、UUID 格式、数字 / 整数 / bigint / binary、日期、枚举范围、JSON 格式
 * 与 format 语义（url / email / phone / color / range）
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
    case 'bigint':
      if (parseBigint(value) === null) return { field: field.field, message: `${field.displayName} 必须是大整数` };
      break;
    case 'binary':
      if (parseBinary(value) === null) return { field: field.field, message: `${field.displayName} 必须是字节序列` };
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

  // ── format 语义校验（在类型校验之后） ────────────────────────────────
  const format = field.format;
  if (format) {
    switch (format.kind) {
      case 'url': {
        const text = String(value);
        let url: URL;
        try {
          url = new URL(text);
        } catch {
          return { field: field.field, message: `${field.displayName} URL 格式不正确` };
        }
        if (format.schemes && format.schemes.length > 0) {
          const scheme = url.protocol.slice(0, -1).toUpperCase();
          if (!format.schemes.some(item => item.toUpperCase() === scheme)) {
            return { field: field.field, message: `${field.displayName} 的协议不在允许范围内` };
          }
        }
        break;
      }
      case 'email':
        if (!isEmailText(String(value))) return { field: field.field, message: `${field.displayName} 邮箱格式不正确` };
        break;
      case 'phone':
        if (!isPhoneText(String(value))) return { field: field.field, message: `${field.displayName} 电话格式不正确` };
        break;
      case 'color':
        if ((format.colorSpace === undefined || format.colorSpace === 'hex') && !HEX_COLOR_RE.test(String(value)))
          return { field: field.field, message: `${field.displayName} 颜色格式不正确` };
        break;
      case 'rating': {
        const n = Number(value);
        const message = validateFormatRange(field.displayName, n, format.min, format.max, format.step);
        if (message) return { field: field.field, message };
        break;
      }
      case 'percentage': {
        const n = Number(value);
        const domain = format.scale === '0..1' ? ([0, 1] as const) : ([0, 100] as const);
        const message = validateFormatRange(
          field.displayName,
          n,
          format.min === undefined ? domain[0] : Math.max(format.min, domain[0]),
          format.max === undefined ? domain[1] : Math.min(format.max, domain[1]),
          format.step
        );
        if (message) return { field: field.field, message };
        break;
      }
      case 'number':
      case 'currency':
      case 'duration': {
        const n = Number(value);
        const message = validateFormatRange(field.displayName, n, format.min, format.max, format.step);
        if (message) return { field: field.field, message };
        break;
      }
    }
  }

  return null;
}
