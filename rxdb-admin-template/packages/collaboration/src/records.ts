import {
  demand,
  type ChangeUnit,
  type Conflict,
  type DataRow,
  type Records,
  type Resolution,
  type Value
} from './model.js';
import type { SystemField } from './schema.js';

/** 单个提交最多包含的变更数，与单个任务的记录数上限一致；客户端导入匿名数据前也按它预检。 */
export const maxChanges = 10000;

export function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
/** 取记录自己的一行：记录标识不是自有属性（例如 `toString`）时返回 undefined，不会取到原型上的成员。 */
export const rowAt = (records: Records, id: string): DataRow | undefined =>
  Object.hasOwn(records, id) ? records[id] : undefined;
const reservedKeys = ['__proto__', 'constructor', 'prototype'];
const safeKey = (key: string) => /^[A-Za-z0-9_-]{1,128}$/.test(key) && !reservedKeys.includes(key);
/**
 * 提交、单元与用户标识的字符集，与命令里的标识相同：1～128 个字母、数字、下划线或连字符，且不是原型链上的名字。
 * UUID（含平台的 UUIDv7 提交与单元 ID）都在其中。
 */
export const isCommitId = (value: unknown): value is string => typeof value === 'string' && safeKey(value);
/**
 * 实体名、命名空间与字段名的字符集：字母开头的字母、数字与下划线，且不是原型链上的名字。
 * 冲突位置 `记录/字段` 与变更表都按这个字符集存放；实体与字段是否存在由数据模式清单裁决。
 */
export const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(value) && !reservedKeys.includes(value);

/** 验证网络输入的记录结构（与实体无关）；实体与字段是否在数据模式清单里、业务完整性由清单检查负责。 */
export function assertRecords(input: unknown): asserts input is Records {
  demand(input !== null && typeof input === 'object' && !Array.isArray(input), 'invalid', '记录格式错误');
  demand(Object.keys(input).length <= 10000, 'limit', '单个任务最多包含 10000 条记录');
  for (const [id, value] of Object.entries(input)) {
    demand(safeKey(id), 'invalid', '记录标识格式错误');
    assertRow(value);
  }
}
function assertRow(value: unknown): asserts value is DataRow {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid', '记录格式错误');
  const row = value as DataRow;
  demand(isIdentifier(row.entity), 'invalid', '实体不受支持');
  assertFields(row.fields);
}
/**
 * 校验字段取值的结构：字段名是安全标识，取值只能是有限数字、不超长的文本、布尔或 null。
 * 文本里不能有 U+0000：补丁与记录存进 PostgreSQL 的 jsonb，jsonb 存不下它，收下了要到写库时才失败。
 */
function assertFields(fields: unknown): asserts fields is Record<string, Value> {
  demand(fields !== null && typeof fields === 'object' && !Array.isArray(fields), 'invalid', '字段格式错误');
  for (const [field, item] of Object.entries(fields)) {
    demand(isIdentifier(field), 'invalid', '字段不受支持');
    demand(item === null || ['string', 'number', 'boolean'].includes(typeof item), 'invalid', '字段值格式错误');
    demand(typeof item !== 'number' || Number.isFinite(item), 'invalid', '数字必须有限');
    demand(typeof item !== 'string' || !item.includes('\u0000'), 'invalid', '字段值格式错误');
    demand(typeof item !== 'string' || item.length <= 10000, 'limit', '字段内容过长');
  }
}

/**
 * 校验一个提交的全部单元在协作这一侧的要求（九列的类型、按操作的补丁有无已由平台的解析与批次判定核对过）：
 * 单元数不超过上限、单元 ID 用标识字符集、命名空间与实体是安全标识、记录标识可作键、补丁的字段名与取值合乎 {@link assertFields}。
 * 取值是写下它的那一端的落库形态（例如 SQLite 上的布尔是 0 / 1、日期是文本），这里只核对 JSON 标量的结构，不改写。
 * 实体、命名空间与字段是否在数据模式清单里，以及单元能否应用到父提交的内容，由服务端在上传时按工作区的清单裁决。
 */
export function assertUnits(units: readonly ChangeUnit[]): void {
  demand(units.length <= maxChanges, 'limit', '单个提交最多包含 10000 项变更');
  for (const unit of units) {
    demand(safeKey(unit.unitId), 'invalid', '变更格式错误');
    demand(isIdentifier(unit.namespace) && isIdentifier(unit.entity), 'invalid', '实体不受支持');
    demand(safeKey(unit.entityId), 'invalid', '记录标识格式错误');
    for (const fields of [unit.patch, unit.inversePatch]) if (fields !== null) assertFields(fields);
  }
}

/** 按记录标识排序重建记录表：读取接口的返回顺序因此只取决于内容，不取决于存储或推导时的插入顺序。 */
export function sortRecords(records: Records): Records {
  const sorted: Records = {};
  for (const id of Object.keys(records).sort()) sorted[id] = records[id];
  return sorted;
}

/** 两条记录（或都不存在）在业务字段上是否相同：实体一致，系统字段之外的字段取值都相同；系统字段不参与。 */
function sameTracked(a: DataRow | undefined, b: DataRow | undefined, system: SystemField): boolean {
  if (!a || !b) return a === b;
  if (a.entity !== b.entity) return false;
  const tracked = (row: DataRow) =>
    Object.fromEntries(Object.entries(row.fields).filter(([field]) => !system(row.entity, field)));
  return same(tracked(a), tracked(b));
}

/**
 * 按字段进行三方比较，保留删除与缺失的区别。记录与字段都按标识顺序比较，
 * 因此结果与冲突列表的顺序只取决于三方内容，不取决于各方记录表的键顺序。
 * `system` 认出系统字段（审计时间与主体，见 `schema.ts` 的 `EntityModel.system`）：它们是每台设备自己的簿记，
 * 记录级的判断只看业务字段，字段级合并里它们从不冲突——来源改过就取来源的，否则取目标的。
 */
export function mergeRecords(
  base: Records,
  source: Records,
  target: Records,
  resolutions: Resolution[],
  system: SystemField
) {
  const result: Records = {};
  const conflicts: Conflict[] = [];
  const used = new Set<string>();
  const context = { resolutions, conflicts, used, system };
  demand(new Set(resolutions.map(r => r.key)).size === resolutions.length, 'invalid', '冲突选择重复');
  for (const id of [...new Set([...Object.keys(base), ...Object.keys(source), ...Object.keys(target)])].sort()) {
    const row = mergeRow(id, { base: base[id], source: source[id], target: target[id] }, context);
    if (row) result[id] = structuredClone(row);
  }
  demand(
    resolutions.every(r => used.has(r.key)),
    'stale',
    '冲突位置已变化，请刷新预览'
  );
  assertRecords(result);
  return { records: result, conflicts };
}
/** 一次合并的上下文：冲突选择、收集到的冲突、用过的选择与系统字段判定。 */
interface MergeContext {
  resolutions: Resolution[];
  conflicts: Conflict[];
  used: Set<string>;
  system: SystemField;
}
/** 同一位置在三方的取值。 */
interface Sides<T> {
  base: T | undefined;
  source: T | undefined;
  target: T | undefined;
}
function mergeRow(id: string, sides: Sides<DataRow>, context: MergeContext): DataRow | undefined {
  const { base, source, target } = sides;
  if (sameTracked(source, target, context.system) || sameTracked(base, target, context.system)) return source;
  if (sameTracked(base, source, context.system)) return target;
  if (!base || !source || !target || source.entity !== target.entity || source.entity !== base.entity) {
    return resolve(
      { key: `${id}/$record`, recordId: id, field: null, base, source, target },
      context.resolutions,
      context.conflicts,
      context.used
    ) as DataRow | undefined;
  }
  const fields: Record<string, Value> = {};
  for (const field of [
    ...new Set([...Object.keys(base.fields), ...Object.keys(source.fields), ...Object.keys(target.fields)])
  ].sort()) {
    const values = { base: base.fields[field], source: source.fields[field], target: target.fields[field] };
    const value =
      context.system(source.entity, field) ?
        same(values.base, values.source) ? values.target
        : values.source
      : mergeField(id, field, values, context);
    if (value !== undefined) fields[field] = value;
  }
  return { entity: source.entity, fields };
}
function mergeField(id: string, field: string, sides: Sides<Value>, context: MergeContext): Value | undefined {
  const { base, source, target } = sides;
  if (same(source, target) || same(base, target)) return source;
  if (same(base, source)) return target;
  return resolve(
    { key: `${id}/${field}`, recordId: id, field, base, source, target },
    context.resolutions,
    context.conflicts,
    context.used
  ) as Value | undefined;
}
function resolve(
  conflict: Conflict,
  resolutions: Resolution[],
  conflicts: Conflict[],
  used: Set<string>
): Value | DataRow | undefined {
  const selection = resolutions.find(item => item.key === conflict.key);
  if (!selection) {
    conflicts.push(conflict);
    return conflict.target;
  }
  used.add(conflict.key);
  if (selection.choice === 'source') return conflict.source;
  if (selection.choice === 'target') return conflict.target;
  demand(Object.hasOwn(selection, 'value'), 'invalid', '自定义冲突值不能为空');
  if (conflict.field === null && selection.value === null) return undefined;
  if (conflict.field === null) assertRow(selection.value);
  return selection.value;
}
