/**
 * @fileoverview 实体元数据注册期校验
 *
 * `format`、`enum`、`options` 的结构规则由逐属性窄类型在编译期拦截；值语义只能在运行时判定。
 * 本模块是给未类型化元数据来源（生成器回填的 JSON、直接调用 `transitionMetadata()`、
 * 跨版本 d.ts 漂移）兜底的运行时闸门：它覆盖全部类型层结构规则并补齐值语义，
 * 不因输入形状畸形而自身抛出非聚合异常。
 */

import {
  EntityPropertyMetadata,
  EntityRelationMetadata,
  FieldFormat,
  PropertyType
} from './metadata-options.interface.js';
import { EntityMetadata } from './metadata.interface.js';

/**
 * 注册期元数据校验规则。
 *
 * @remarks
 * 全集 13 项，由 {@link validateEntityMetadata} 产出。
 * `missingRelationPrimary` / `unsupportedRelationValueType` 属于 {@link RelationResolutionRule}，
 * 由字段描述 DTO 的生成阶段产出，不在本联合内。
 */
export type MetadataValidationRule =
  | 'unknownFormat'
  | 'formatTypeMismatch'
  | 'formatOnRelation'
  | 'readonlyOnRelation'
  | 'missingFormatConfig'
  | 'invalidFormatConfig'
  | 'invalidRange'
  | 'missingEnum'
  | 'invalidEnumConfig'
  | 'duplicateEnum'
  | 'enumOptionsMismatch'
  | 'invalidOptionsConfig'
  | 'cardinalityConflict';

/**
 * 关系目标解析规则。
 *
 * @remarks
 * 与 {@link MetadataValidationRule} 故意不合并：两者的产出方、产出时机和错误类型都不同。
 * 本联合由字段描述 DTO 的生成入口产出。
 */
export type RelationResolutionRule = 'missingRelationPrimary' | 'unsupportedRelationValueType';

/**
 * 单条元数据违规。
 */
export interface EntityMetadataValidationError {
  namespace: string;
  entity: string;
  field: string;
  rule: MetadataValidationRule;
  message: string;
}

/** 支持的 format kind 与其合法载体 PropertyType 的唯一真相源（AC#12 结构 fixture 共用）。 */
export const FIELD_FORMAT_CARRIERS = {
  plainText: [PropertyType.string],
  multilineText: [PropertyType.string],
  richText: [PropertyType.string],
  url: [PropertyType.string],
  email: [PropertyType.string],
  phone: [PropertyType.string],
  code: [PropertyType.string],
  color: [PropertyType.string],
  number: [PropertyType.number, PropertyType.integer],
  currency: [PropertyType.number],
  percentage: [PropertyType.number],
  rating: [PropertyType.number, PropertyType.integer],
  duration: [PropertyType.number, PropertyType.integer],
  dateTime: [PropertyType.date],
  singleSelect: [PropertyType.enum],
  multiSelect: [PropertyType.stringArray]
} as const satisfies Record<FieldFormat['kind'], readonly PropertyType[]>;

/** format kind 全集，顺序即声明顺序。 */
export const FIELD_FORMAT_KINDS = Object.keys(FIELD_FORMAT_CARRIERS) as readonly FieldFormat['kind'][];

/** 单值/多值冲突组合：这两组既是载体不匹配，也是明确的 cardinality 语义错误，优先报后者。 */
const CARDINALITY_CONFLICTS: readonly { kind: FieldFormat['kind']; type: PropertyType }[] = [
  { kind: 'multiSelect', type: PropertyType.enum },
  { kind: 'singleSelect', type: PropertyType.stringArray }
];

/** 各 kind 的必填配置键。 */
const REQUIRED_CONFIG_KEYS: Partial<Record<FieldFormat['kind'], readonly string[]>> = {
  richText: ['contentType'],
  currency: ['currency'],
  percentage: ['scale'],
  duration: ['unit'],
  rating: ['min', 'max', 'step']
};

/**
 * `format` 配置键全集（不含 `kind` 本身）。
 *
 * @remarks
 * 注册期校验与字段描述 DTO 解析器共用同一份键名字典：前者判「这个 kind 不该有这个键」，
 * 后者判「这个键不属于协议、直接丢弃」。两边各写一份必然漂移。
 */
export type FieldFormatConfigKey =
  | 'colorSpace'
  | 'contentType'
  | 'currency'
  | 'display'
  | 'language'
  | 'max'
  | 'min'
  | 'scale'
  | 'schemes'
  | 'step'
  | 'timezone'
  | 'unit';

/**
 * 各 kind 允许出现的配置键（不含 `kind` 本身）。
 *
 * @remarks
 * 值类型保持 `readonly string[]` 而非字面量元组：调用方需要用任意 `string` 做 `includes`
 * 判存，收窄成字面量只会逼出一堆断言。
 */
export const FIELD_FORMAT_CONFIG_KEYS: Record<FieldFormat['kind'], readonly string[]> = {
  plainText: [],
  multilineText: [],
  richText: ['contentType'],
  url: ['schemes'],
  email: [],
  phone: [],
  code: ['language'],
  color: ['colorSpace'],
  number: ['min', 'max', 'step'],
  currency: ['currency', 'min', 'max', 'step'],
  percentage: ['scale', 'min', 'max', 'step'],
  rating: ['min', 'max', 'step'],
  duration: ['unit', 'min', 'max', 'step'],
  dateTime: ['timezone', 'display'],
  singleSelect: [],
  multiSelect: []
};

/** 枚举型配置键的合法字面量。 */
const ENUM_CONFIG_VALUES: Record<string, readonly string[]> = {
  contentType: ['text/markdown', 'text/html'],
  scale: ['0..1', '0..100'],
  unit: ['ms', 's', 'min', 'h', 'd'],
  colorSpace: ['hex', 'rgb', 'hsl', 'hsv', 'lab', 'lch'],
  display: ['date', 'time', 'datetime']
};

/** percentage 的固有值域。 */
const PERCENTAGE_DOMAIN: Record<string, readonly [number, number]> = {
  '0..1': [0, 1],
  '0..100': [0, 100]
};

const CURRENCY_RE = /^[A-Z]{3}$/;
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const OPTION_DISPLAY_KEYS: readonly string[] = ['label', 'color', 'disabled'];
const NUMERIC_CONFIG_KEYS: readonly string[] = ['min', 'max', 'step'];
/** step 对齐容差，与 `validateFieldValue()` 共用同一口径。 */
const STEP_EPSILON_FACTOR = 8;

/** 判断是否为普通对象（排除数组、`null` 与类实例以外的宿主对象）。 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 按同一容差判断商是否为整数。 */
const isStepAligned = (quotient: number): boolean =>
  Math.abs(quotient - Math.round(quotient)) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * STEP_EPSILON_FACTOR;

/** 校验 `schemes` 数组语法。 */
const invalidSchemes = (value: unknown): string | null => {
  if (!Array.isArray(value)) return '必须是字符串数组';
  const bad = value.filter(item => typeof item !== 'string' || !SCHEME_RE.test(item));
  return bad.length > 0 ? `包含非法 scheme ${JSON.stringify(bad)}` : null;
};

/** 校验单个配置键的值语义，返回错误描述或 `null`。 */
const invalidConfigValue = (key: string, value: unknown): string | null => {
  if (key === 'schemes') return invalidSchemes(value);
  if (key === 'currency') {
    return typeof value === 'string' && CURRENCY_RE.test(value) ? null : '必须是 ISO 4217 形状的三位大写代码';
  }
  if (key === 'language' || key === 'timezone') {
    return typeof value === 'string' && value.length > 0 ? null : '必须是非空字符串';
  }
  const literals = ENUM_CONFIG_VALUES[key];
  if (literals) {
    return typeof value === 'string' && literals.includes(value) ? null : `必须是 ${literals.join(' | ')} 之一`;
  }
  if (NUMERIC_CONFIG_KEYS.includes(key)) {
    return typeof value === 'number' ? null : '必须是数字';
  }
  return null;
};

/** 校验数值范围语义（`min/max/step` 与 percentage 固有值域）。 */
const invalidRangeMessage = (format: Record<string, unknown>): string | null => {
  const nums = NUMERIC_CONFIG_KEYS.map(key => ({ key, value: format[key] })).filter(
    (item): item is { key: string; value: number } => typeof item.value === 'number'
  );
  const nonFinite = nums.find(item => !Number.isFinite(item.value));
  if (nonFinite) return `${nonFinite.key} 必须是有限数`;

  const min = typeof format['min'] === 'number' ? format['min'] : undefined;
  const max = typeof format['max'] === 'number' ? format['max'] : undefined;
  const step = typeof format['step'] === 'number' ? format['step'] : undefined;

  if (step !== undefined && step <= 0) return 'step 必须大于 0';
  if (min !== undefined && max !== undefined && min > max) return `min (${min}) 不能大于 max (${max})`;

  const domain = typeof format['scale'] === 'string' ? PERCENTAGE_DOMAIN[format['scale']] : undefined;
  if (domain) {
    const outside = [min, max].filter(value => value !== undefined && (value < domain[0] || value > domain[1]));
    if (outside.length > 0) {
      return `min/max ${JSON.stringify(outside)} 超出 scale ${String(format['scale'])} 的固有值域 [${domain[0]}, ${domain[1]}]`;
    }
  }

  if (format['kind'] !== 'rating') return null;
  if (min === undefined || max === undefined || step === undefined) return null;
  if (min >= max) return `rating 要求 min (${min}) 小于 max (${max})`;
  return isStepAligned((max - min) / step) ? null : `rating 端点无法按 step ${step} 对齐`;
};

/** 违规收集器，保证同一字段同一 rule 最多一条。 */
class ViolationCollector {
  private readonly errors: EntityMetadataValidationError[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly namespace: string,
    private readonly entity: string
  ) {}

  add(field: string, rule: MetadataValidationRule, message: string): void {
    const key = `${field} ${rule}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.errors.push({ namespace: this.namespace, entity: this.entity, field, rule, message: `${field}: ${message}` });
  }

  drain(): EntityMetadataValidationError[] {
    return this.errors;
  }
}

/**
 * 判定 format 违规，命中即停。
 *
 * @param format - 原始 `format` 值（可能是任意 `unknown` 形状）
 * @param type - 载体属性的 `PropertyType`；载体是关系时为 `undefined`
 */
const detectFormatViolation = (
  format: unknown,
  type: string | undefined
): { rule: MetadataValidationRule; message: string } | null => {
  if (!isPlainObject(format)) return { rule: 'invalidFormatConfig', message: 'format 必须是普通对象' };
  const kind = format['kind'];
  if (typeof kind !== 'string') return { rule: 'invalidFormatConfig', message: 'format 缺少字符串 kind' };
  if (type === undefined) return { rule: 'formatOnRelation', message: '关系不接受 format 声明' };

  const allowed = FIELD_FORMAT_CONFIG_KEYS[kind as FieldFormat['kind']];
  if (!allowed) return { rule: 'unknownFormat', message: `未知的 format.kind "${kind}"` };

  const conflict = CARDINALITY_CONFLICTS.find(item => item.kind === kind && item.type === type);
  if (conflict) {
    return { rule: 'cardinalityConflict', message: `format "${kind}" 与 PropertyType "${type}" 的单值/多值语义冲突` };
  }

  const carriers = FIELD_FORMAT_CARRIERS[kind as FieldFormat['kind']] as readonly string[];
  if (!carriers.includes(type)) {
    return { rule: 'formatTypeMismatch', message: `format "${kind}" 不能用在 PropertyType "${type}" 上` };
  }

  const missing = (REQUIRED_CONFIG_KEYS[kind as FieldFormat['kind']] ?? []).filter(key => !(key in format));
  if (missing.length > 0) {
    return { rule: 'missingFormatConfig', message: `format "${kind}" 缺少必填配置 ${missing.join('、')}` };
  }

  const unknownKeys = Object.keys(format).filter(key => key !== 'kind' && !allowed.includes(key));
  if (unknownKeys.length > 0) {
    return { rule: 'invalidFormatConfig', message: `format "${kind}" 不接受配置键 ${unknownKeys.join('、')}` };
  }

  const badKey = allowed
    .filter(key => key in format)
    .map(key => ({ key, reason: invalidConfigValue(key, format[key]) }))
    .find(item => item.reason !== null);
  if (badKey) return { rule: 'invalidFormatConfig', message: `format "${kind}" 的 ${badKey.key} ${badKey.reason}` };

  const range = invalidRangeMessage(format);
  return range ? { rule: 'invalidRange', message: `format "${kind}" 的 ${range}` } : null;
};

/** 校验 `enum` 声明本身，返回是否可继续判定重复值与 options 子集。 */
const validateEnumDeclaration = (
  collector: ViolationCollector,
  name: string,
  declared: unknown
): readonly string[] | null => {
  if (!Array.isArray(declared) || declared.some(item => typeof item !== 'string')) {
    collector.add(name, 'invalidEnumConfig', 'enum 必须是字符串数组');
    return null;
  }
  const values = declared as readonly string[];
  const duplicates = [...new Set(values.filter((item, index) => values.indexOf(item) !== index))];
  if (duplicates.length > 0) {
    collector.add(name, 'duplicateEnum', `enum 存在重复值 ${JSON.stringify(duplicates)}`);
    return null;
  }
  return values;
};

/** 校验 `options` 声明本身，返回是否可继续判定键越界。 */
const validateOptionsDeclaration = (collector: ViolationCollector, name: string, declared: unknown): boolean => {
  if (!isPlainObject(declared)) {
    collector.add(name, 'invalidOptionsConfig', 'options 必须是普通对象');
    return false;
  }
  const bad = Object.entries(declared).find(([, display]) => {
    if (!isPlainObject(display)) return true;
    if (Object.keys(display).some(key => !OPTION_DISPLAY_KEYS.includes(key))) return true;
    if ('label' in display && typeof display['label'] !== 'string') return true;
    if ('color' in display && typeof display['color'] !== 'string') return true;
    return 'disabled' in display && typeof display['disabled'] !== 'boolean';
  });
  if (bad) {
    collector.add(name, 'invalidOptionsConfig', `options["${bad[0]}"] 展示项非法`);
    return false;
  }
  return true;
};

/** 判定该属性是否必须声明非空 `enum`。 */
const requiresEnum = (property: Record<string, unknown>): boolean => {
  if (property['type'] === PropertyType.enum) return true;
  if (property['type'] !== PropertyType.stringArray) return false;
  const format = property['format'];
  const multiSelect = isPlainObject(format) && format['kind'] === 'multiSelect';
  return multiSelect || 'options' in property;
};

/** 校验 `enum` 与 `options` 族规则，与 format 族相互独立。 */
const validateEnumAndOptions = (collector: ViolationCollector, property: Record<string, unknown>): void => {
  const name = String(property['name']);
  const hasEnum = 'enum' in property;
  const values = hasEnum ? validateEnumDeclaration(collector, name, property['enum']) : null;

  if (requiresEnum(property) && (!hasEnum || (values !== null && values.length === 0))) {
    collector.add(name, 'missingEnum', '必须声明非空 enum');
  }

  if (!('options' in property)) return;
  if (!validateOptionsDeclaration(collector, name, property['options'])) return;
  if (values === null) return;

  const outside = Object.keys(property['options'] as Record<string, unknown>).filter(key => !values.includes(key));
  if (outside.length > 0) {
    collector.add(name, 'enumOptionsMismatch', `options 的键 ${JSON.stringify(outside)} 不在 enum 内`);
  }
};

/** 校验单个属性/计算属性。 */
const validateProperty = (collector: ViolationCollector, property: EntityPropertyMetadata): void => {
  const raw = property as unknown as Record<string, unknown>;
  const name = String(raw['name']);
  if ('format' in raw) {
    const violation = detectFormatViolation(raw['format'], String(raw['type']));
    if (violation) collector.add(name, violation.rule, violation.message);
  }
  validateEnumAndOptions(collector, raw);
};

/** 校验单个关系。 */
const validateRelation = (collector: ViolationCollector, relation: EntityRelationMetadata): void => {
  const raw = relation as unknown as Record<string, unknown>;
  const name = String(raw['name']);
  if ('format' in raw) {
    const violation = detectFormatViolation(raw['format'], undefined);
    if (violation) collector.add(name, violation.rule, violation.message);
  }
  if ('readonly' in raw) {
    collector.add(name, 'readonlyOnRelation', '关系不接受 readonly 声明，DTO 恒输出 readonly: true');
  }
};

/** 稳定排序：namespace → entity → field → rule。 */
const compareViolations = (a: EntityMetadataValidationError, b: EntityMetadataValidationError): number =>
  a.namespace.localeCompare(b.namespace) ||
  a.entity.localeCompare(b.entity) ||
  a.field.localeCompare(b.field) ||
  a.rule.localeCompare(b.rule);

/**
 * 校验单个实体的元数据声明，返回按 `namespace/entity/field/rule` 排序的全部违规。
 *
 * @remarks
 * 纯函数：不抛异常、不修改入参、不访问全局状态。畸形输入（`format: null`、非数组 `enum` 等）
 * 一律转成违规条目而不是运行时崩溃。跨实体聚合与抛错由 `EntityManager.init()` 负责。
 *
 * @param metadata - `transitionMetadata()` 产出的实体元数据
 * @returns 排序后的违规列表；无违规时为空数组
 *
 * @example
 * ```typescript
 * const errors = validateEntityMetadata(getEntityMetadata(User));
 * if (errors.length > 0) throw new RxDBError(errors.map(e => e.message).join('\n'));
 * ```
 */
export function validateEntityMetadata(metadata: EntityMetadata): readonly EntityMetadataValidationError[] {
  const collector = new ViolationCollector(metadata.namespace, metadata.name);
  metadata.propertyMap.forEach(property => validateProperty(collector, property));
  metadata.computedPropertyMap.forEach(property => validateProperty(collector, property));
  metadata.relationMap.forEach(relation => validateRelation(collector, relation));
  return collector.drain().sort(compareViolations);
}

/**
 * 把跨实体聚合后的违规渲染成单条异常消息。
 *
 * @param errors - 已聚合的违规列表
 */
export function formatMetadataViolations(errors: readonly EntityMetadataValidationError[]): string {
  const lines = errors.map(
    error => `  ${error.namespace}.${error.entity}.${error.field} [${error.rule}] ${error.message}`
  );
  return [`实体元数据校验失败（${errors.length} 项）：`, ...lines].join('\n');
}

/**
 * 跨实体聚合校验，并把全部违规排序后一次性返回。
 *
 * @param metadataList - 待校验的实体元数据集合
 */
export function validateEntityMetadataSet(
  metadataList: readonly EntityMetadata[]
): readonly EntityMetadataValidationError[] {
  return metadataList.flatMap(metadata => validateEntityMetadata(metadata)).sort(compareViolations);
}
