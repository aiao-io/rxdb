import {
  demand,
  type ChangeSet,
  type Check,
  type Conflict,
  type DataRow,
  type Records,
  type Resolution,
  type Value
} from './model.js';

/** 资产实体的命名空间；字段级变更的 `namespace` 目前只能是它，元数据清单落地后改由清单决定。 */
export const assetNamespace = 'assets';
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
const safeKey = (key: string) =>
  /^[A-Za-z0-9_-]{1,128}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);
const entityFields = {
  AssetCategory: ['name', 'description'],
  Asset: ['name', 'status', 'purchasePrice', 'purchaseDate', 'categoryId'],
  AssetEvent: ['summary', 'cost', 'happenedAt', 'assetId']
};

/** 验证网络输入的记录结构；业务完整性由最终结果检查负责。 */
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
  demand(Object.hasOwn(entityFields, row.entity), 'invalid', '实体不受支持');
  assertFields(row.entity, row.fields);
}
/** 校验某个实体的字段取值：字段必须在白名单里，取值只能是有限数字、不超长的文本、布尔或 null。 */
function assertFields(entity: DataRow['entity'], fields: unknown): asserts fields is Record<string, Value> {
  demand(fields !== null && typeof fields === 'object' && !Array.isArray(fields), 'invalid', '字段格式错误');
  for (const [field, item] of Object.entries(fields)) {
    demand(entityFields[entity].includes(field), 'invalid', '字段不受支持');
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

/** 验证网络输入的字段级变更列表：形状、命名空间、实体、记录标识、操作与各字段取值；是否与父提交内容相符由推导内容时裁决。 */
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
  demand(change['namespace'] === assetNamespace, 'invalid', '实体不受支持');
  demand(
    typeof change['entity'] === 'string' && Object.hasOwn(entityFields, change['entity']),
    'invalid',
    '实体不受支持'
  );
  demand(typeof change['entityId'] === 'string' && safeKey(change['entityId']), 'invalid', '记录标识格式错误');
  const operation = change['operation'];
  demand(typeof operation === 'string' && Object.hasOwn(changeShapes, operation), 'invalid', '变更格式错误');
  const [patch, inversePatch] = changeShapes[operation as ChangeSet['operation']];
  demand(
    (change['patch'] !== null) === patch && (change['inversePatch'] !== null) === inversePatch,
    'invalid',
    '变更格式错误'
  );
  for (const fields of [change['patch'], change['inversePatch']])
    if (fields !== null) assertFields(change['entity'] as DataRow['entity'], fields);
}

/**
 * 检查合并后的完整资产图，允许未完成的草稿同步，禁止无效结果进入共享数据。
 *
 * 名称缺失、为 null 或只有空白时只报「必填文本不能为空」，不参与名称唯一性比较；
 * 关联字段不是字符串时直接判定「关联记录不存在」，不会把值转成字符串后去查记录。
 */
export function checkRecords(records: Records): Check[] {
  assertRecords(records);
  const errors: Check[] = [];
  const names = new Map<string, string>();
  for (const [id, row] of Object.entries(records)) checkRow(id, row, records, names, errors);
  return errors;
}
function checkRow(id: string, row: DataRow, records: Records, names: Map<string, string>, errors: Check[]): void {
  const add = (field: string, message: string) => errors.push({ recordId: id, field, message });
  const label = row.entity === 'AssetEvent' ? 'summary' : 'name';
  const text = row.fields[label];
  const filled = typeof text === 'string' && text.trim() !== '';
  if (!filled) add(label, '必填文本不能为空');
  if (filled && row.entity !== 'AssetEvent') {
    const key = `${row.entity}:${text}`;
    if (names.has(key)) add('name', '名称必须唯一');
    names.set(key, id);
  }
  const relation = row.entity === 'Asset' ? ['categoryId', 'AssetCategory'] : ['assetId', 'Asset'];
  const reference = row.fields[relation[0]];
  if (row.entity !== 'AssetCategory' && !(typeof reference === 'string' && records[reference]?.entity === relation[1]))
    add(relation[0], '关联记录不存在');
  for (const [field, value] of Object.entries(row.fields)) checkValue(field, value, add);
  if (row.entity === 'AssetEvent' && !row.fields.happenedAt) add('happenedAt', '日期不能为空');
}
function checkValue(field: string, value: Value, add: (field: string, message: string) => void): void {
  if (value === null) return;
  if (['cost', 'purchasePrice'].includes(field)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) add(field, '金额必须为非负数');
    return;
  }
  if (typeof value !== 'string') add(field, '必须为文本');
  if (
    ['purchaseDate', 'happenedAt'].includes(field) &&
    (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value) || !validDate(value))
  )
    add(field, '日期无效');
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

function validDate(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === day;
}
