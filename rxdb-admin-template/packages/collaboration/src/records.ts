import {
  demand,
  type ChangeSet,
  type Conflict,
  type DataRow,
  type Records,
  type Resolution,
  type Value
} from './model.js';

/** 单个提交最多包含的变更数，与单个任务的记录数上限一致。 */
const maxChanges = 10000;

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
/** 校验字段取值的结构：字段名是安全标识，取值只能是有限数字、不超长的文本、布尔或 null。 */
function assertFields(fields: unknown): asserts fields is Record<string, Value> {
  demand(fields !== null && typeof fields === 'object' && !Array.isArray(fields), 'invalid', '字段格式错误');
  for (const [field, item] of Object.entries(fields)) {
    demand(isIdentifier(field), 'invalid', '字段不受支持');
    demand(item === null || ['string', 'number', 'boolean'].includes(typeof item), 'invalid', '字段值格式错误');
    demand(typeof item !== 'number' || Number.isFinite(item), 'invalid', '数字必须有限');
    demand(typeof item !== 'string' || item.length <= 10000, 'limit', '字段内容过长');
  }
}
const changeKeys = ['namespace', 'entity', 'entityId', 'operation', 'patch', 'inversePatch'];
/** 各操作要求 `patch` 与 `inversePatch` 是否存在：新增只有 patch，修改两者都有，删除只有 inversePatch。 */
const changeShapes: Record<ChangeSet['operation'], [patch: boolean, inversePatch: boolean]> = {
  insert: [true, false],
  update: [true, true],
  delete: [false, true]
};

/**
 * 验证网络输入的字段级变更列表的结构：形状、命名空间与实体的字符集、记录标识、操作与各字段取值。
 * 实体、命名空间与字段是否在数据模式清单里，以及变更能否应用到父提交的内容，由服务端在上传时按工作区的清单裁决。
 */
export function assertChanges(input: unknown): asserts input is ChangeSet[] {
  demand(Array.isArray(input), 'invalid', '变更格式错误');
  demand(input.length <= maxChanges, 'limit', '单个提交最多包含 10000 项变更');
  for (const change of input) assertChange(change);
}
function assertChange(value: unknown): asserts value is ChangeSet {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid', '变更格式错误');
  const change = value as Record<string, unknown>;
  const keys = Object.keys(change);
  demand(keys.length === changeKeys.length && changeKeys.every(key => keys.includes(key)), 'invalid', '变更格式错误');
  demand(isIdentifier(change['namespace']) && isIdentifier(change['entity']), 'invalid', '实体不受支持');
  demand(typeof change['entityId'] === 'string' && safeKey(change['entityId']), 'invalid', '记录标识格式错误');
  const operation = change['operation'];
  demand(typeof operation === 'string' && Object.hasOwn(changeShapes, operation), 'invalid', '变更格式错误');
  const [patch, inversePatch] = changeShapes[operation as ChangeSet['operation']];
  demand(
    (change['patch'] !== null) === patch && (change['inversePatch'] !== null) === inversePatch,
    'invalid',
    '变更格式错误'
  );
  for (const fields of [change['patch'], change['inversePatch']]) if (fields !== null) assertFields(fields);
}

/** 按记录标识排序重建记录表：读取接口的返回顺序因此只取决于内容，不取决于存储或推导时的插入顺序。 */
export function sortRecords(records: Records): Records {
  const sorted: Records = {};
  for (const id of Object.keys(records).sort()) sorted[id] = records[id];
  return sorted;
}

/**
 * 按字段进行三方比较，保留删除与缺失的区别。记录与字段都按标识顺序比较，
 * 因此结果与冲突列表的顺序只取决于三方内容，不取决于各方记录表的键顺序。
 */
export function mergeRecords(base: Records, source: Records, target: Records, resolutions: Resolution[]) {
  const result: Records = {};
  const conflicts: Conflict[] = [];
  const used = new Set<string>();
  demand(new Set(resolutions.map(r => r.key)).size === resolutions.length, 'invalid', '冲突选择重复');
  for (const id of [...new Set([...Object.keys(base), ...Object.keys(source), ...Object.keys(target)])].sort()) {
    const row = mergeRow(id, base[id], source[id], target[id], resolutions, conflicts, used);
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
function mergeRow(
  id: string,
  base: DataRow | undefined,
  source: DataRow | undefined,
  target: DataRow | undefined,
  resolutions: Resolution[],
  conflicts: Conflict[],
  used: Set<string>
): DataRow | undefined {
  if (same(source, target) || same(base, target)) return source;
  if (same(base, source)) return target;
  if (!base || !source || !target || source.entity !== target.entity || source.entity !== base.entity) {
    return resolve(
      { key: `${id}/$record`, recordId: id, field: null, base, source, target },
      resolutions,
      conflicts,
      used
    ) as DataRow | undefined;
  }
  const fields: Record<string, Value> = {};
  for (const field of [
    ...new Set([...Object.keys(base.fields), ...Object.keys(source.fields), ...Object.keys(target.fields)])
  ].sort()) {
    const value = mergeField(
      id,
      field,
      base.fields[field],
      source.fields[field],
      target.fields[field],
      resolutions,
      conflicts,
      used
    );
    if (value !== undefined) fields[field] = value;
  }
  return { entity: source.entity, fields };
}
function mergeField(
  id: string,
  field: string,
  base: Value | undefined,
  source: Value | undefined,
  target: Value | undefined,
  resolutions: Resolution[],
  conflicts: Conflict[],
  used: Set<string>
): Value | undefined {
  if (same(source, target) || same(base, target)) return source;
  if (same(base, source)) return target;
  return resolve({ key: `${id}/${field}`, recordId: id, field, base, source, target }, resolutions, conflicts, used) as
    Value | undefined;
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
