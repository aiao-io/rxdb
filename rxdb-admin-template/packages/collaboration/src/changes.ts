import { demand, type ChangeSet, type DataRow, type Records, type Value } from './model.js';
import { assetNamespace, canonical } from './records.js';

type Fields = Record<string, Value>;

const mismatch = '提交内容与其父提交不一致';

const rowOf = (records: Records, id: string): DataRow | undefined =>
  Object.hasOwn(records, id) ? records[id] : undefined;
const sameValue = (a: Value | undefined, b: Value | undefined) => canonical(a) === canonical(b);
const insertOf = (entityId: string, row: DataRow): ChangeSet => ({
  namespace: assetNamespace,
  entity: row.entity,
  entityId,
  operation: 'insert',
  patch: { ...row.fields },
  inversePatch: null
});
const deleteOf = (entityId: string, row: DataRow): ChangeSet => ({
  namespace: assetNamespace,
  entity: row.entity,
  entityId,
  operation: 'delete',
  patch: null,
  inversePatch: { ...row.fields }
});
/** 同一实体的一条记录前后不同：`patch` 取新值，`inversePatch` 取旧值，新增或移除的字段只出现在其中一边；没有变化返回 undefined。 */
function updateOf(entityId: string, before: DataRow, after: DataRow): ChangeSet | undefined {
  const patch: Fields = {};
  const inversePatch: Fields = {};
  for (const field of new Set([...Object.keys(before.fields), ...Object.keys(after.fields)])) {
    const had = Object.hasOwn(before.fields, field);
    const has = Object.hasOwn(after.fields, field);
    if (had && has && sameValue(before.fields[field], after.fields[field])) continue;
    if (has) patch[field] = after.fields[field];
    if (had) inversePatch[field] = before.fields[field];
  }
  if (!Object.keys(patch).length && !Object.keys(inversePatch).length) return undefined;
  return {
    namespace: assetNamespace,
    entity: after.entity,
    entityId,
    operation: 'update',
    patch,
    inversePatch
  };
}

/**
 * 逐记录逐字段比较两份记录，得到把 `before` 变成 `after` 的字段级变更；变更按记录标识排序，同样的输入总得到同样的输出。
 * 新增、删除各一条；同一实体的记录只列出变化的字段；实体变了的记录先删除再新增。
 */
export function diffRecords(before: Records, after: Records): ChangeSet[] {
  const changes: ChangeSet[] = [];
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const old = rowOf(before, id);
    const row = rowOf(after, id);
    if (old && row && old.entity === row.entity) {
      const change = updateOf(id, old, row);
      if (change) changes.push(change);
      continue;
    }
    if (old) changes.push(deleteOf(id, old));
    if (row) changes.push(insertOf(id, row));
  }
  return changes;
}

/** 变更某一边的字段；与操作要求不符（例如修改没有字段）说明数据已损坏或被伪造。 */
function fieldsOf(fields: Fields | null): Fields {
  demand(fields, 'invalid', mismatch);
  return fields;
}
/** 取出必须存在、且与变更同一实体的记录。 */
function existing(records: Records, change: ChangeSet): DataRow {
  const row = rowOf(records, change.entityId);
  demand(row && row.entity === change.entity, 'invalid', mismatch);
  return row;
}
/** 把 `from` 里有、`to` 里没有的字段删掉，再写入 `to` 的字段，使记录字段从 `from` 一侧回到 `to` 一侧。 */
function rewrite(row: DataRow, from: Fields, to: Fields): void {
  for (const field of Object.keys(from)) if (!Object.hasOwn(to, field)) delete row.fields[field];
  Object.assign(row.fields, to);
}

function applyOne(records: Records, change: ChangeSet): void {
  if (change.operation === 'insert') {
    demand(!rowOf(records, change.entityId), 'invalid', mismatch);
    records[change.entityId] = { entity: change.entity, fields: { ...fieldsOf(change.patch) } };
  } else if (change.operation === 'update') {
    rewrite(existing(records, change), fieldsOf(change.inversePatch), fieldsOf(change.patch));
  } else {
    existing(records, change);
    delete records[change.entityId];
  }
}
function revertOne(records: Records, change: ChangeSet): void {
  if (change.operation === 'insert') {
    existing(records, change);
    delete records[change.entityId];
  } else if (change.operation === 'update') {
    rewrite(existing(records, change), fieldsOf(change.patch), fieldsOf(change.inversePatch));
  } else {
    demand(!rowOf(records, change.entityId), 'invalid', mismatch);
    records[change.entityId] = { entity: change.entity, fields: { ...fieldsOf(change.inversePatch) } };
  }
}

/**
 * 把变更按顺序应用到记录上，**就地修改**并返回同一个对象（需要保留原内容时先 `structuredClone`）。
 * 变更必须与记录当前内容相符：新增的记录不能已存在，修改或删除的记录必须存在且是同一实体，否则抛出 `invalid`。
 */
export function applyChanges(records: Records, changes: readonly ChangeSet[]): Records {
  for (const change of changes) applyOne(records, change);
  return records;
}
/**
 * {@link applyChanges} 的逆运算：按相反的顺序撤销变更，**就地修改**并返回同一个对象。
 * 用于由较新的内容反推较早版本的内容；同样要求变更与记录当前内容相符。
 */
export function revertChanges(records: Records, changes: readonly ChangeSet[]): Records {
  for (const change of [...changes].reverse()) revertOne(records, change);
  return records;
}
