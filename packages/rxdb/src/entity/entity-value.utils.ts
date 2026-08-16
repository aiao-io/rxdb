/**
 * @packageDocumentation
 * 实体值处理工具模块
 * 提供字段值解析、格式化、验证等功能
 *
 * @remarks
 * 值校验并存两代入口：冻结的 {@link validateEntityFieldValue} 吃 `EntityFieldConfig`，
 * 新增的 {@link validateFieldValue} 吃 `EntityFieldDescriptor`。两者**不互相调用**，
 * 只共用本文件里提取出来的内部谓词（D11）——否则冻结层的行为改动会经由新函数外溢。
 */
import type {
  EntityComputedFieldDescriptor,
  EntityFieldConfig,
  EntityFieldDescriptor,
  EntityFieldType,
  EntityPropertyFieldDescriptor,
  EntityRelationFieldDescriptor
} from './entity-field.utils.js';
import { isPlainRecord } from './json-safe.js';
import type {
  CurrencyFormat,
  DurationFormat,
  FieldFormat,
  NumberFormat,
  PercentageFormat,
  PropertyType,
  RatingFormat,
  UrlFormat
} from './metadata-options.interface.js';

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

// ------------------------------------------------------[ 两代校验共用的内部谓词 ]
//
// 提取自冻结的 validateEntityFieldValue：新旧函数各自组装这些谓词，谁都不调用对方（D11）。
// 注意共用到此为止——旧函数对 number/uuid 走 `Number()` / `String()` 强制转换，
// 新函数按「无 fallback 兜底」铁律只认原生类型，这份差异是刻意的，不要合并。

/** 值是否为「空」：`null`、`undefined` 或空串。 */
const isBlankValue = (value: unknown): boolean => value == null || value === '';

/** required 缺失判定：空值，或空数组。 */
const isRequiredMissing = (value: unknown): boolean =>
  isBlankValue(value) || (Array.isArray(value) && value.length === 0);

/** 文本是否为 UUID（大小写不敏感）。 */
const isUuidText = (text: string): boolean => UUID_RE.test(text);

/** 转成合法 `Date`；无法解析时返回 `null`。 */
const toValidDate = (value: unknown): Date | null => {
  const date = value instanceof Date ? value : new Date(value as number | string);
  return isNaN(date.getTime()) ? null : date;
};

/** 文本是否能被 `JSON.parse` 解析。 */
const isParsableJsonText = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** 值（按字符串形态）是否命中枚举白名单。 */
const isEnumMember = (allowed: readonly string[], value: unknown): boolean => allowed.includes(String(value));

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

/**
 * 字段值校验失败的描述。
 *
 * @remarks
 * `rule` 与 `value` 只由 {@link validateFieldValue} 产出；冻结的
 * {@link validateEntityFieldValue} 永远只返回 `field` 与 `message` 两个键。
 */
export interface FieldValidationError {
  /** 字段的物理名 */
  field: string;
  /** 面向用户的错误文案 */
  message: string;
  /** 命中的规则标识，供调用方做程序化分支 */
  rule?: FieldValidationRule;
  /** 触发失败的值，已规范化为 JSON-safe 形态；无法安全转换或字段加密时该键不存在 */
  value?: JsonValue;
}

/**
 * 按 {@link EntityFieldConfig} 校验字段值。
 *
 * @deprecated 请改用 {@link validateFieldValue}——它吃 {@link EntityFieldDescriptor}，
 * 支持 `format` / `enum` 语义并返回 `rule` 与规范化后的 `value`。本函数的签名、行为与输出已冻结，
 * 与 {@link EntityFieldConfig} 一同保留至下一个主版本。
 */
export function validateEntityFieldValue(field: EntityFieldConfig, value: unknown): FieldValidationError | null {
  if (field.required && isRequiredMissing(value)) {
    return { field: field.field, message: `${field.displayName} 是必填项` };
  }

  if (isBlankValue(value)) return null;

  switch (field.type) {
    case 'uuid':
      if (!isUuidText(String(value))) return { field: field.field, message: `${field.displayName} 格式不正确` };
      break;
    case 'number':
    case 'integer':
      if (isNaN(Number(value))) return { field: field.field, message: `${field.displayName} 必须是数字` };
      if (field.type === 'integer' && !Number.isInteger(Number(value)))
        return { field: field.field, message: `${field.displayName} 必须是整数` };
      break;
    case 'date':
      if (!toValidDate(value)) return { field: field.field, message: `${field.displayName} 日期格式不正确` };
      break;
    case 'enum':
      if (field.enumValues && !isEnumMember(field.enumValues, value)) {
        return { field: field.field, message: `${field.displayName} 值不在允许范围内` };
      }
      break;
    case 'json':
      if (typeof value === 'string' && !isParsableJsonText(value)) {
        return { field: field.field, message: `${field.displayName} JSON 格式不正确` };
      }
      break;
  }

  return null;
}

// ------------------------------------------------------[ US-012 阶段 C：描述符值校验 ]

/**
 * JSON 可序列化的值。
 *
 * @remarks
 * {@link FieldValidationError.value} 的类型上界：错误对象要能直接 `JSON.stringify` 后过网络，
 * 因此 `Date` / `bigint` / `Uint8Array` 一律先规范化成字符串，无法安全转换的干脆不带。
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * {@link validateFieldValue} 可能命中的规则标识。
 *
 * @remarks
 * 新增成员是破坏性变更：调用方通常对该联合做穷尽分支。共 15 个成员。
 */
export type FieldValidationRule =
  | 'date'
  | 'email'
  | 'enum'
  | 'integer'
  | 'json'
  | 'number'
  | 'numberArray'
  | 'phone'
  | 'range'
  | 'required'
  | 'stringArray'
  | 'type'
  | 'url'
  | 'urlScheme'
  | 'uuid';

/** 带值域约束的数字类 format。 */
type NumericFormat = CurrencyFormat | DurationFormat | NumberFormat | PercentageFormat | RatingFormat;

/** 单条违规：规则标识 + 文案。`field` 与 `value` 由 {@link toFieldError} 统一补齐。 */
interface ValueViolation {
  rule: FieldValidationRule;
  message: string;
}

/** 数字值域的最终边界，`percentage` 已与固有值域取过交集。 */
interface NumericBounds {
  max?: number;
  min?: number;
  step?: number;
}

/** 规范化失败的哨兵：与「值本身是 `null`」区分开。 */
const UNSAFE_VALUE = Symbol('unsafeValue');

type NormalizedValue = JsonValue | typeof UNSAFE_VALUE;

/** `percentage` 各刻度的固有值域。 */
const PERCENTAGE_DOMAIN: Record<PercentageFormat['scale'], readonly [number, number]> = {
  '0..1': [0, 1],
  '0..100': [0, 100]
};

const violation = (rule: FieldValidationRule, message: string): ValueViolation => ({ rule, message });

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toHexText = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

/** 邮箱：无空白、恰好一个 `@`、且域名部分含 `.`。 */
const isEmailText = (text: string): boolean => {
  if (/\s/.test(text)) return false;
  const parts = text.split('@');
  if (parts.length !== 2) return false;
  return parts[0].length > 0 && parts[1].includes('.');
};

/** 电话：可选 `+` 前缀，其余仅数字、空格、括号与连字符，长度 3～32。 */
const isPhoneText = (text: string): boolean => text.length >= 3 && text.length <= 32 && /^\+?[\d ()-]+$/.test(text);

/** 解析 URL；非法时返回 `null`。 */
const toUrl = (text: string): URL | null => {
  try {
    return new URL(text);
  } catch {
    return null;
  }
};

/**
 * 值是否落在「以 `base` 为起点、`step` 为步长」的刻度上。
 *
 * @remarks
 * 浮点除法必然带误差（`0.3 / 0.1 === 2.9999999999999996`），按商的量级放大 `EPSILON` 容差，
 * 而不是拿固定阈值硬卡。
 */
const isOnStep = (value: number, base: number, step: number): boolean => {
  const quotient = (value - base) / step;
  return Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
};

/** 严格 JSON 形状判定：`Date`、`Uint8Array`、`Map`、类实例、`bigint`、`NaN` 一律不算。 */
const isStrictJsonValue = (value: unknown): boolean => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return (value as readonly unknown[]).every(isStrictJsonValue);
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every(isStrictJsonValue);
};

function normalizeJsonList(items: readonly unknown[]): NormalizedValue {
  const result: JsonValue[] = [];
  for (const item of items) {
    const normalized = normalizeJsonValue(item);
    if (normalized === UNSAFE_VALUE) return UNSAFE_VALUE;
    result.push(normalized);
  }
  return result;
}

function normalizeJsonRecord(record: Record<string, unknown>): NormalizedValue {
  const result: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(record)) {
    const normalized = normalizeJsonValue(item);
    if (normalized === UNSAFE_VALUE) return UNSAFE_VALUE;
    result[key] = normalized;
  }
  return result;
}

function normalizeJsonObject(value: object): NormalizedValue {
  if (value instanceof Date) return isNaN(value.getTime()) ? UNSAFE_VALUE : value.toISOString();
  if (value instanceof Uint8Array) return toHexText(value);
  if (Array.isArray(value)) return normalizeJsonList(value as readonly unknown[]);
  if (!isPlainRecord(value)) return UNSAFE_VALUE;
  return normalizeJsonRecord(value);
}

/**
 * 把任意值规范化成 JSON-safe 形态；任一层无法安全转换即整体判定为 {@link UNSAFE_VALUE}。
 *
 * @remarks
 * `Date` → ISO 8601 字符串，`bigint` → 十进制字符串，`Uint8Array` → 小写 hex。
 * 函数、`symbol`、`Map`、实体实例与 `NaN` / `Infinity` 都不可安全转换。
 */
function normalizeJsonValue(value: unknown): NormalizedValue {
  if (value === null) return null;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : UNSAFE_VALUE;
    case 'bigint':
      return value.toString(10);
    case 'object':
      return normalizeJsonObject(value);
    default:
      return UNSAFE_VALUE;
  }
}

function checkStringArray(displayName: string, value: unknown): ValueViolation | null {
  const ok = Array.isArray(value) && (value as readonly unknown[]).every(item => typeof item === 'string');
  return ok ? null : violation('stringArray', `${displayName} 必须是字符串数组`);
}

function checkNumberArray(displayName: string, value: unknown): ValueViolation | null {
  const ok = Array.isArray(value) && (value as readonly unknown[]).every(isFiniteNumber);
  return ok ? null : violation('numberArray', `${displayName} 必须是数字数组`);
}

function checkJsonValue(displayName: string, value: unknown): ValueViolation | null {
  if (typeof value === 'string') {
    return isParsableJsonText(value) ? null : violation('json', `${displayName} JSON 格式不正确`);
  }
  return isStrictJsonValue(value) ? null : violation('json', `${displayName} 必须是可 JSON 序列化的值`);
}

/**
 * 按 `valueType` 校验值的运行时形态。
 *
 * @remarks
 * 这是 INV-1 的执行点：值的形状**只**由 `PropertyType` / `RelationKind` 决定，`format` 不参与。
 */
function checkValueType(valueType: `${PropertyType}`, displayName: string, value: unknown): ValueViolation | null {
  switch (valueType) {
    case 'uuid':
      return typeof value === 'string' && isUuidText(value) ? null : violation('uuid', `${displayName} 格式不正确`);
    case 'enum':
    case 'string':
      return typeof value === 'string' ? null : violation('type', `${displayName} 必须是字符串`);
    case 'number':
      return isFiniteNumber(value) ? null : violation('number', `${displayName} 必须是数字`);
    case 'integer':
      if (!isFiniteNumber(value)) return violation('number', `${displayName} 必须是数字`);
      return Number.isInteger(value) ? null : violation('integer', `${displayName} 必须是整数`);
    case 'bigint':
      return typeof value === 'bigint' ? null : violation('type', `${displayName} 必须是 bigint`);
    case 'binary':
      return value instanceof Uint8Array ? null : violation('type', `${displayName} 必须是 Uint8Array`);
    case 'boolean':
      return typeof value === 'boolean' ? null : violation('type', `${displayName} 必须是布尔值`);
    case 'date':
      return toValidDate(value) ? null : violation('date', `${displayName} 日期格式不正确`);
    case 'stringArray':
      return checkStringArray(displayName, value);
    case 'numberArray':
      return checkNumberArray(displayName, value);
    case 'keyValue':
      return isPlainRecord(value) ? null : violation('type', `${displayName} 必须是键值对象`);
    case 'json':
      return checkJsonValue(displayName, value);
    default:
      throw new TypeError(`validateFieldValue: 未知字段类型 '${String(valueType)}'`);
  }
}

/**
 * 校验枚举成员资格。
 *
 * @remarks
 * D2：成员资格与 `format` 无关。多值字段逐项检查并把**全部**非法项写进文案，
 * 让调用方一次看清要改哪几项；`options[].disabled` 只影响展示，不影响合法性。
 */
function checkEnumMembership(allowed: readonly string[], displayName: string, value: unknown): ValueViolation | null {
  if (!Array.isArray(value)) {
    return isEnumMember(allowed, value) ? null : violation('enum', `${displayName} 值不在允许范围内：${String(value)}`);
  }
  const invalid = (value as readonly unknown[]).filter(item => !isEnumMember(allowed, item));
  if (invalid.length === 0) return null;
  return violation('enum', `${displayName} 存在不在允许范围内的取值：${invalid.map(String).join('、')}`);
}

function checkUrlFormat(format: UrlFormat, displayName: string, value: unknown): ValueViolation | null {
  const url = toUrl(String(value));
  if (!url) return violation('url', `${displayName} 不是合法的 URL`);
  if (!format.schemes) return null;
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  const allowed = format.schemes.map(item => item.toLowerCase());
  return allowed.includes(scheme) ? null : violation('urlScheme', `${displayName} 的协议不在允许范围内：${scheme}`);
}

/** `percentage` 的实际值域是「声明值域 ∩ 刻度固有值域」，其余数字 format 直接用声明值域。 */
function resolveNumericBounds(format: NumericFormat): NumericBounds {
  const declared: NumericBounds = { max: format.max, min: format.min, step: format.step };
  if (format.kind !== 'percentage') return declared;
  const [low, high] = PERCENTAGE_DOMAIN[format.scale];
  return {
    max: declared.max === undefined ? high : Math.min(declared.max, high),
    min: declared.min === undefined ? low : Math.max(declared.min, low),
    step: declared.step
  };
}

function checkNumericFormat(format: NumericFormat, displayName: string, value: number): ValueViolation | null {
  const bounds = resolveNumericBounds(format);
  if (bounds.min !== undefined && value < bounds.min) {
    return violation('range', `${displayName} 不能小于 ${bounds.min}`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    return violation('range', `${displayName} 不能大于 ${bounds.max}`);
  }
  if (bounds.step === undefined) return null;
  const base = bounds.min ?? 0;
  return isOnStep(value, base, bounds.step) ? null : (
      violation('range', `${displayName} 必须落在以 ${base} 为起点、步长 ${bounds.step} 的刻度上`)
    );
}

/**
 * 校验 `format` 附加的值语义。
 *
 * @remarks
 * 只在 {@link checkValueType} 通过后调用，因此这里的 `value` 已经是 format 承载类型的合法值——
 * 数字类 format 只挂在 `number` / `integer` 上，文本类只挂在 `string` 上（注册期由
 * `validateEntityMetadata()` 把关）。
 */
function checkFormat(format: FieldFormat, displayName: string, value: unknown): ValueViolation | null {
  switch (format.kind) {
    case 'url':
      return checkUrlFormat(format, displayName, value);
    case 'email':
      return isEmailText(String(value)) ? null : violation('email', `${displayName} 不是合法的邮箱地址`);
    case 'phone':
      return isPhoneText(String(value)) ? null : violation('phone', `${displayName} 不是合法的电话号码`);
    case 'currency':
    case 'duration':
    case 'number':
    case 'percentage':
    case 'rating':
      return checkNumericFormat(format, displayName, value as number);
    // 只影响展示、不约束值的 format：显式列全，新增 kind 时由穷尽检查报错而不是被静默放行
    case 'code':
    case 'color':
    case 'dateTime':
    case 'multiSelect':
    case 'multilineText':
    case 'plainText':
    case 'richText':
    case 'singleSelect':
      return null;
    default:
      throw new TypeError(`validateFieldValue: 未知 format kind '${String((format as FieldFormat).kind)}'`);
  }
}

function checkPropertyValue(
  descriptor: EntityComputedFieldDescriptor | EntityPropertyFieldDescriptor,
  value: unknown
): ValueViolation | null {
  const typeViolation = checkValueType(descriptor.valueType, descriptor.displayName, value);
  if (typeViolation) return typeViolation;
  if (descriptor.enum && descriptor.enum.length > 0) {
    const enumViolation = checkEnumMembership(descriptor.enum, descriptor.displayName, value);
    if (enumViolation) return enumViolation;
  }
  if (!descriptor.format) return null;
  return checkFormat(descriptor.format, descriptor.displayName, value);
}

/**
 * 校验关系字段的外键值。
 *
 * @remarks
 * 只看外键本身的形态，**不**回表确认目标记录存在——那是仓储层的事，值校验必须是纯函数。
 * 单值 / 多值由 `relation.mutation` 判定：`add-remove` 对应 1:m / m:n，值必须是数组。
 */
function checkRelationValue(descriptor: EntityRelationFieldDescriptor, value: unknown): ValueViolation | null {
  if (descriptor.relation.mutation === 'set-remove') {
    return checkValueType(descriptor.valueType, descriptor.displayName, value);
  }
  if (!Array.isArray(value)) return violation('type', `${descriptor.displayName} 必须是数组`);
  for (const item of value as readonly unknown[]) {
    const found = checkValueType(descriptor.valueType, descriptor.displayName, item);
    if (found) return found;
  }
  return null;
}

/** 补齐 `field`，并在允许时挂上规范化后的 `value`。加密字段永不回显。 */
function toFieldError(descriptor: EntityFieldDescriptor, found: ValueViolation, value: unknown): FieldValidationError {
  const error: FieldValidationError = { field: descriptor.field, message: found.message, rule: found.rule };
  if (descriptor.encrypted === true) return error;
  const normalized = normalizeJsonValue(value);
  if (normalized === UNSAFE_VALUE) return error;
  error.value = normalized;
  return error;
}

/**
 * 按 {@link EntityFieldDescriptor} 校验单个字段值。
 *
 * @remarks
 * 纯函数：不查库、不构造仓储、不解析实体元数据，只看描述符与值本身。校验顺序是
 * required → 类型 → 枚举成员 → format 值语义，任一环失败即短路返回，不累积多条错误。
 *
 * 该函数与 {@link validateEntityFieldValue} 并存且**行为不对齐**：新函数按「无 fallback 兜底」
 * 只认原生类型，`'3.14'` 不是合法的 `number`；旧函数的 `Number()` 强制转换保持冻结。
 *
 * @param descriptor - 来自 `describeEntityFields()` 或 `parseEntityFieldsDescriptor()` 的字段描述
 * @param value - 待校验的值
 * @returns 校验通过返回 `null`，否则返回 {@link FieldValidationError}
 * @throws 当 `valueType` 或 `format.kind` 不在封闭集合内时抛出 `TypeError`
 *
 * @example
 * ```ts
 * const fields = describeEntityFields(Article);
 * const homepage = fields.fields.find(item => item.field === 'homepage')!;
 * validateFieldValue(homepage, 'ftp://example.com');
 * // → { field: 'homepage', message: '主页 的协议不在允许范围内：ftp', rule: 'urlScheme', value: 'ftp://example.com' }
 * ```
 */
export function validateFieldValue(descriptor: EntityFieldDescriptor, value: unknown): FieldValidationError | null {
  if (descriptor.required === true && isRequiredMissing(value)) {
    return toFieldError(descriptor, violation('required', `${descriptor.displayName} 是必填项`), value);
  }
  if (isBlankValue(value)) return null;

  const found =
    descriptor.source === 'relation' ? checkRelationValue(descriptor, value) : checkPropertyValue(descriptor, value);
  return found ? toFieldError(descriptor, found, value) : null;
}
