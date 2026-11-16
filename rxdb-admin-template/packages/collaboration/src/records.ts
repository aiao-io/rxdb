import { demand, type Check, type Conflict, type DataRow, type Records, type Resolution, type Value } from './model.js';

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
  demand(
    row.fields !== null && typeof row.fields === 'object' && !Array.isArray(row.fields),
    'invalid',
    '字段格式错误'
  );
  for (const [field, item] of Object.entries(row.fields)) {
    demand(entityFields[row.entity].includes(field), 'invalid', '字段不受支持');
    demand(item === null || ['string', 'number', 'boolean'].includes(typeof item), 'invalid', '字段值格式错误');
    demand(typeof item !== 'number' || Number.isFinite(item), 'invalid', '数字必须有限');
    demand(typeof item !== 'string' || item.length <= 10000, 'limit', '字段内容过长');
  }
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

/** 按字段进行三方比较，保留删除与缺失的区别。 */
export function mergeRecords(base: Records, source: Records, target: Records, resolutions: Resolution[]) {
  const result: Records = {};
  const conflicts: Conflict[] = [];
  const used = new Set<string>();
  demand(new Set(resolutions.map(r => r.key)).size === resolutions.length, 'invalid', '冲突选择重复');
  for (const id of new Set([...Object.keys(base), ...Object.keys(source), ...Object.keys(target)])) {
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
  for (const field of new Set([
    ...Object.keys(base.fields),
    ...Object.keys(source.fields),
    ...Object.keys(target.fields)
  ])) {
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
