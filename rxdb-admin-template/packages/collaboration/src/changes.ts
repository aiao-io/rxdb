import { demand, type ChangeSet, type DataRow, type Records, type Value } from './model.js';
import { canonical, rowAt } from './records.js';

type Fields = Record<string, Value>;
/** 实体名到命名空间（由数据模式清单给出，见 `schema.ts` 的 `namespaceOf`）：字段级变更的 `namespace` 按它填写。 */
export type NamespaceOf = (entity: string) => string;

const mismatch = '提交内容与其父提交不一致';

const sameValue = (a: Value | undefined, b: Value | undefined) => canonical(a) === canonical(b);
const insertOf = (entityId: string, row: DataRow, namespaceOf: NamespaceOf): ChangeSet => ({
  namespace: namespaceOf(row.entity),
  entity: row.entity,
  entityId,
  operation: 'insert',
  patch: { ...row.fields },
  inversePatch: null
});
const deleteOf = (entityId: string, row: DataRow, namespaceOf: NamespaceOf): ChangeSet => ({
  namespace: namespaceOf(row.entity),
  entity: row.entity,
  entityId,
  operation: 'delete',
  patch: null,
  inversePatch: { ...row.fields }
});
/** 同一实体的一条记录前后不同：`patch` 取新值，`inversePatch` 取旧值，新增或移除的字段只出现在其中一边；没有变化返回 undefined。 */
function updateOf(entityId: string, before: DataRow, after: DataRow, namespaceOf: NamespaceOf): ChangeSet | undefined {
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
    namespace: namespaceOf(after.entity),
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
 * @param namespaceOf 实体所属的命名空间，取自数据模式清单；实体不在清单里时由它抛错。
 */
export function diffRecords(before: Records, after: Records, namespaceOf: NamespaceOf): ChangeSet[] {
  const changes: ChangeSet[] = [];
  for (const id of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const old = rowAt(before, id);
    const row = rowAt(after, id);
    if (old && row && old.entity === row.entity) {
      const change = updateOf(id, old, row, namespaceOf);
      if (change) changes.push(change);
      continue;
    }
    if (old) changes.push(deleteOf(id, old, namespaceOf));
    if (row) changes.push(insertOf(id, row, namespaceOf));
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
  const row = rowAt(records, change.entityId);
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
    demand(!rowAt(records, change.entityId), 'invalid', mismatch);
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
    demand(!rowAt(records, change.entityId), 'invalid', mismatch);
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
 * 核对一项修改的 `inversePatch` 与原记录一致：`inversePatch` 里的每个字段原记录都有且取值相同，
 * 只出现在 `patch` 里的字段（新增字段）原记录没有。不一致时撤销这项修改就回不到原记录，说明提交与父提交不符。
 */
function verifyUpdate(row: DataRow, change: ChangeSet): void {
  const patch = fieldsOf(change.patch);
  const inverse = fieldsOf(change.inversePatch);
  for (const [field, value] of Object.entries(inverse))
    demand(Object.hasOwn(row.fields, field) && sameValue(row.fields[field], value), 'invalid', mismatch);
  for (const field of Object.keys(patch))
    demand(Object.hasOwn(inverse, field) || !Object.hasOwn(row.fields, field), 'invalid', mismatch);
}
function verifyOne(records: Records, change: ChangeSet): void {
  if (change.operation === 'update') verifyUpdate(existing(records, change), change);
  if (change.operation === 'delete')
    demand(
      canonical(existing(records, change).fields) === canonical(fieldsOf(change.inversePatch)),
      'invalid',
      mismatch
    );
  applyOne(records, change);
}
/**
 * 上传时用：把变更按顺序应用到记录上，并核对每一项都与当时的内容相符，**就地修改**并返回同一个对象。
 * 新增要求原记录不存在；修改与删除要求原记录存在、实体相同，且 `inversePatch` 与原值一致——修改只核对它列出的字段，
 * 并要求只出现在 `patch` 里的字段原来不存在；删除的 `inversePatch` 必须正好是原记录的整行。任一项不符即抛出 `invalid`。
 * `records` 只需含这些变更涉及的记录。
 */
export function applyVerified(records: Records, changes: readonly ChangeSet[]): Records {
  for (const change of changes) verifyOne(records, change);
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
