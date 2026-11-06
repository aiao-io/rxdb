import { DEFAULT_WIDGET_ORDER, PINNED_WIDGETS } from './defaults.js';
import type { AdminPreferences, DeepPartial, WidgetKey } from './types.js';

type UnknownRecord = Record<string, unknown>;

/** 叶子取值约束，由偏好 schema 派生。 */
export type PreferenceConstraint =
  | { readonly kind: 'enum'; readonly values: readonly string[]; readonly nullable?: boolean }
  | {
      readonly kind: 'number';
      readonly min?: number;
      readonly max?: number;
      readonly nullable?: boolean;
    }
  | {
      readonly kind: 'pattern';
      readonly pattern: RegExp;
      readonly normalize?: (value: string) => string | undefined;
    };

/** 路径（点分隔）到约束的映射。 */
export type PreferenceConstraints = Readonly<Record<string, PreferenceConstraint>>;

/** 开放记录的路径：键由应用注册，不按默认树逐键清洗。 */
const OPEN_RECORD_PATH = 'extension';

/**
 * 判断是否为普通对象。
 * @param value - 任意值。
 * @returns 是普通对象（非 null、非数组）。
 */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 深合并补丁：对象递归，数组与叶子整体替换，`undefined` 忽略，`null` 是有效值。
 * @param current - 当前值。
 * @param patch - 补丁。
 * @returns 新值，不修改入参。
 */
export function applyPatch<T>(current: T, patch: unknown): T {
  if (patch === undefined) return current;
  if (Array.isArray(patch)) return [...patch] as T;
  if (!isRecord(patch)) return patch as T;
  const base: UnknownRecord = isRecord(current) ? current : {};
  const out: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = applyPatch(base[key], value);
  return out as T;
}

const sameArray = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((item, index) => Object.is(item, b[index]));

const diffNode = (current: unknown, base: unknown): unknown => {
  if (Array.isArray(base) && Array.isArray(current)) return sameArray(current, base) ? undefined : [...current];
  if (isRecord(base) && isRecord(current)) {
    const out: UnknownRecord = {};
    for (const key of new Set([...Object.keys(current), ...Object.keys(base)])) {
      const delta = diffNode(current[key], base[key]);
      if (delta !== undefined) out[key] = delta;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (current === undefined) return undefined;
  return Object.is(current, base) ? undefined : current;
};

/**
 * 计算相对基线的结构化差异。
 * @param current - 当前偏好。
 * @param base - 基线偏好。
 * @returns 差异；无差异返回 `null`。
 */
export function diffPreferences(
  current: AdminPreferences,
  base: AdminPreferences
): DeepPartial<AdminPreferences> | null {
  const delta = diffNode(current, base);
  return (delta as DeepPartial<AdminPreferences> | undefined) ?? null;
}

const clamp = (value: number, min: number | undefined, max: number | undefined): number =>
  Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));

const applyConstraint = (raw: unknown, base: unknown, constraint: PreferenceConstraint): unknown => {
  if (constraint.kind === 'pattern') {
    if (typeof raw !== 'string') return base;
    const normalized = constraint.normalize ? constraint.normalize(raw) : raw;
    return normalized !== undefined && constraint.pattern.test(normalized) ? normalized : base;
  }
  if (raw === null) return constraint.nullable ? null : base;
  if (constraint.kind === 'enum') {
    return typeof raw === 'string' && constraint.values.includes(raw) ? raw : base;
  }
  return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, constraint.min, constraint.max) : base;
};

const uniqueStrings = (raw: unknown): string[] | undefined =>
  Array.isArray(raw) && raw.every(item => typeof item === 'string') ? [...new Set(raw as string[])] : undefined;

const sanitizeWidgetOrder = (raw: unknown, base: readonly unknown[]): WidgetKey[] => {
  const known = new Set<string>(DEFAULT_WIDGET_ORDER);
  const given = (uniqueStrings(raw) ?? (base as string[])).filter(key => known.has(key));
  const missing = DEFAULT_WIDGET_ORDER.filter(key => !given.includes(key));
  return [...given, ...missing] as WidgetKey[];
};

const sanitizeHiddenWidgets = (raw: unknown, base: readonly unknown[]): WidgetKey[] => {
  const known = new Set<string>(DEFAULT_WIDGET_ORDER);
  const pinned = new Set<string>(PINNED_WIDGETS);
  const given = uniqueStrings(raw) ?? (base as string[]);
  return given.filter(key => known.has(key) && !pinned.has(key)) as WidgetKey[];
};

const sanitizeArray = (raw: unknown, base: readonly unknown[], path: string): unknown[] => {
  if (path === 'widget.order') return sanitizeWidgetOrder(raw, base);
  if (path === 'widget.hidden') return sanitizeHiddenWidgets(raw, base);
  return uniqueStrings(raw) ?? [...base];
};

const sanitizeLeaf = (raw: unknown, base: unknown, constraint: PreferenceConstraint | undefined): unknown => {
  if (constraint) return applyConstraint(raw, base, constraint);
  if (typeof base === 'number') return typeof raw === 'number' && Number.isFinite(raw) ? raw : base;
  return typeof raw === typeof base ? raw : base;
};

const sanitizeNode = (raw: unknown, base: unknown, path: string, constraints: PreferenceConstraints): unknown => {
  if (path === OPEN_RECORD_PATH) return isRecord(raw) ? { ...raw } : { ...(base as UnknownRecord) };
  if (Array.isArray(base)) return sanitizeArray(raw, base, path);
  if (!isRecord(base)) return sanitizeLeaf(raw, base, constraints[path]);
  const source = isRecord(raw) ? raw : {};
  const out: UnknownRecord = {};
  for (const key of Object.keys(base)) {
    out[key] = sanitizeNode(source[key], base[key], path === '' ? key : `${path}.${key}`, constraints);
  }
  return out;
};

/**
 * 按默认树的形状清洗任意输入：丢弃未知键，类型不符或越界的叶子回到默认值，
 * 数值按约束夹取，部件顺序补全为完整排列。永不抛错。
 * @param raw - 待清洗的输入（来自存储、导入或补丁合并结果）。
 * @param defaults - 默认树，决定形状与回退值。
 * @param constraints - 叶子约束。
 * @returns 完整合法的偏好树。
 */
export function sanitizePreferences(
  raw: unknown,
  defaults: AdminPreferences,
  constraints: PreferenceConstraints = {}
): AdminPreferences {
  return sanitizeNode(raw, defaults, '', constraints) as AdminPreferences;
}

/**
 * 读取点分路径的值。
 * @param tree - 偏好树。
 * @param path - 点分路径。
 * @returns 值；路径不存在返回 `undefined`。
 */
export function getPath(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), tree);
}

/**
 * 把点分路径的值转成补丁对象。
 * @param path - 点分路径。
 * @param value - 值。
 * @returns 可交给 {@link applyPatch} 的补丁。
 */
export function pathToPatch(path: string, value: unknown): UnknownRecord {
  return path
    .split('.')
    .reverse()
    .reduce<unknown>((inner, key) => ({ [key]: inner }), value) as UnknownRecord;
}
