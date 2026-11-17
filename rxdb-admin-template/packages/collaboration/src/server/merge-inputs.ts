import { applyChanges, revertChanges } from '../changes.js';
import type { ChangeSet, DataRow, Records, Resolution, Value } from '../model.js';
import { canonical, rowAt } from '../records.js';
import {
  isMissing,
  recordKeys,
  recordKeyText,
  schemaModel,
  type EntityModel,
  type RecordField,
  type RecordKey,
  type SchemaModel
} from '../schema.js';
import type { MergeInputs, Plan } from './plan.js';
import type { CommitStore, Link } from './store.js';

type InputsPlan = Extract<Plan, { type: 'inputs' }>;
/** 改动过的记录在三处的取值。 */
interface Sides {
  touched: string[];
  base: Records;
  source: Records;
  target: Records;
}

const ids = (links: readonly Link[]) => links.map(link => link.id);
const entityIds = (changes: ReadonlyMap<string, ChangeSet[]>) =>
  [...changes.values()].flatMap(list => list.map(change => change.entityId));

/** 由新到旧反向应用共享分支上各合并提交的变更（就地修改）。 */
function revert(rows: Records, links: readonly Link[], changes: ReadonlyMap<string, ChangeSet[]>): Records {
  for (const link of links) revertChanges(rows, changes.get(link.id) ?? []);
  return rows;
}
/** 由旧到新应用任务分支上各提交的变更（就地修改）。 */
function forward(rows: Records, links: readonly Link[], changes: ReadonlyMap<string, ChangeSet[]>): Records {
  for (const link of [...links].reverse()) applyChanges(rows, changes.get(link.id) ?? []);
  return rows;
}

/** 自定义的整条记录要先有记录的形状（实体名是文本、字段是对象）才能预读；不合格的由引擎在合并时拒绝。 */
const rowShaped = (value: unknown): value is DataRow =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as DataRow).entity === 'string' &&
  (value as DataRow).fields !== null &&
  typeof (value as DataRow).fields === 'object';
/** 冲突选择里针对这条记录的自定义取值：整条记录（`$record`）与各字段的自定义值。 */
function customsOf(id: string, resolutions: readonly Resolution[]) {
  const rows: DataRow[] = [];
  const fields = new Map<string, Value[]>();
  for (const resolution of resolutions) {
    if (resolution.choice !== 'custom' || !resolution.key.startsWith(`${id}/`)) continue;
    const field = resolution.key.slice(id.length + 1);
    const value = resolution.value;
    if (field === '$record' && rowShaped(value)) rows.push(value);
    if (field !== '$record' && (value === null || typeof value !== 'object'))
      fields.set(field, [...(fields.get(field) ?? []), value ?? null]);
  }
  return { rows, fields };
}
/** 一个字段的候选取值对应的键：唯一字段的非缺失取值，单值关联的非缺失文本外键。 */
function fieldKeys(entity: EntityModel, field: RecordField, values: readonly (Value | undefined)[]): RecordKey[] {
  return values.flatMap(value => {
    if (isMissing(value)) return [];
    const keys: RecordKey[] = [];
    if (field.descriptor.unique)
      keys.push({ kind: 'unique', entity: entity.entity, field: field.name, value: canonical(value) });
    if (field.target !== undefined && typeof value === 'string')
      keys.push({ kind: 'reference', entity: entity.entity, field: field.name, value });
    return keys;
  });
}
/**
 * 合并结果里这条记录可能取的键：合并结果要么是 B、S、T 或自定义的整条记录之一，要么是同一实体的字段级合并，
 * 其中每个字段的取值来自 B、S、T 或该字段的自定义值。按这些候选收集唯一键与外键目标，是合并结果的键的超集。
 * 不在清单里的实体只可能来自自定义取值，由引擎拒绝，这里不预读。
 */
function possibleKeys(model: SchemaModel, rows: readonly DataRow[], customs: ReadonlyMap<string, Value[]>) {
  return rows.flatMap(row => {
    const entity = model.entity(row.entity);
    return entity ?
        entity.fields.flatMap(field =>
          fieldKeys(entity, field, [row.fields[field.name], ...(customs.get(field.name) ?? [])])
        )
      : [];
  });
}
/** 合并结果里这条记录可能消失或换了实体：三处不全都有、实体不一致，或有整条记录的冲突选择。 */
function unstable(id: string, sides: Sides, resolutions: readonly Resolution[]): boolean {
  const rows = [rowAt(sides.base, id), rowAt(sides.source, id), rowAt(sides.target, id)];
  if (rows.some(row => !row) || new Set(rows.map(row => row!.entity)).size > 1) return true;
  return resolutions.some(resolution => resolution.key === `${id}/$record`);
}

/**
 * 跨记录检查要用到的 T 里的数据，分两轮按需读取：
 * 1. 改动记录的候选取值涉及的唯一键（查持有者）与外键目标（读整行）；可能消失或换了实体的记录，读引用它们的记录；
 *    与改动记录共用唯一键的、引用它们的未改动记录都是受牵连的记录（suspects），也读整行。
 * 2. 受牵连记录自己的唯一键与外键目标，补齐它们的检查需要的数据。
 * 每一轮只发固定几条查询，读取量与改动的记录数有关，与共享记录总数无关。
 */
async function crossRecord(store: CommitStore, model: SchemaModel, sides: Sides, plan: InputsPlan) {
  const touched = new Set(sides.touched);
  const unique = new Map<string, RecordKey>();
  const wanted = new Set<string>();
  const add = (key: RecordKey) => {
    if (key.kind === 'unique') unique.set(recordKeyText(key), key);
    else if (!touched.has(key.value)) wanted.add(key.value);
  };
  for (const id of sides.touched) {
    const customs = customsOf(id, plan.resolutions);
    const rows = [rowAt(sides.base, id), rowAt(sides.source, id), rowAt(sides.target, id), ...customs.rows];
    possibleKeys(
      model,
      rows.filter(row => row !== undefined),
      customs.fields
    ).forEach(add);
  }
  // 重新打开线程时要比较锚定记录在新结果里的取值，没改动的记录取 T 的
  for (const { recordIds } of plan.reopen) for (const id of recordIds) if (!touched.has(id)) wanted.add(id);
  const holders = await store.holders([...unique.values()]);
  const moved = sides.touched.filter(id => unstable(id, sides, plan.resolutions));
  const referencers = moved.length ? await store.referencing(moved) : {};
  const related: Records = {};
  for (const [id, row] of Object.entries(referencers)) if (!touched.has(id)) related[id] = row;
  const suspects = new Set(Object.keys(related));
  for (const list of holders.values()) for (const id of list) if (!touched.has(id)) suspects.add(id);
  const first = [...new Set([...wanted, ...suspects])].filter(id => !Object.hasOwn(related, id));
  if (first.length) Object.assign(related, await store.shared(first));
  const known = new Set([...first, ...Object.keys(related)]);
  // 第二轮：受牵连记录自己的唯一键与外键目标
  const more = new Map<string, RecordKey>();
  const targets = new Set<string>();
  for (const id of suspects)
    for (const key of Object.hasOwn(related, id) ? recordKeys(plan.schema, related[id]) : []) {
      if (key.kind === 'unique' && !holders.has(recordKeyText(key))) more.set(recordKeyText(key), key);
      if (key.kind === 'reference' && !touched.has(key.value) && !known.has(key.value)) targets.add(key.value);
    }
  if (more.size) for (const [key, list] of await store.holders([...more.values()])) holders.set(key, list);
  if (targets.size) Object.assign(related, await store.shared([...targets]));
  for (const id of targets) known.add(id);
  return { related, known: [...known], suspects: [...suspects].sort(), holders: Object.fromEntries(holders) };
}

/**
 * 三方合并输入，只读合并基以来任一侧改动过的记录：共享分支在 `base` 之后各合并提交的变更、任务分支在 `base` 之后各提交的变更，
 * 它们涉及的记录就是 `touched`。T 只读这些记录；B 由 T 反向应用共享分支上的变更得到，S 由 B 加上任务分支的变更得到；
 * 其余记录三方相同，合并结果就是 T，不必读取。合并基为空（第一次合并之前）时 B 没有记录，T 的每条记录都算改动过。
 * 另按清单读取跨记录检查要用到的记录与唯一键（见 {@link crossRecord}）。
 * 成本与「合并基以来双方改动的记录数」有关，与共享记录总数、提交总数无关。`base` 不在共享分支上、或 `source` 不经过 `base` 时返回 null。
 */
export async function mergeInputs(store: CommitStore, plan: InputsPlan): Promise<MergeInputs | null> {
  const shared = plan.base === null ? undefined : await store.path(plan.head, plan.base);
  if (shared && !shared.reached) return null;
  const task = await store.path(plan.source, plan.base);
  if (!task.reached) return null;
  const sharedChanges = shared ? await store.changes(ids(shared.links)) : new Map<string, ChangeSet[]>();
  const taskChanges = await store.changes(ids(task.links));
  const target = await (plan.base === null ?
    store.shared()
  : store.shared([...new Set([...entityIds(sharedChanges), ...entityIds(taskChanges)])]));
  const touched = [
    ...new Set([...(plan.base === null ? Object.keys(target) : entityIds(sharedChanges)), ...entityIds(taskChanges)])
  ].sort();
  const base = plan.base === null ? {} : revert(structuredClone(target), shared!.links, sharedChanges);
  const source = forward(structuredClone(base), task.links, taskChanges);
  const sides = { touched, base, source, target };
  return { ...sides, ...(await crossRecord(store, schemaModel(plan.schema), sides, plan)) };
}
