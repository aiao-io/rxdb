import type { DataRow, Records, Value } from './model.js';

/** 带种子的伪随机数生成器（mulberry32）：同一种子每次产生同一序列，随机测试失败时可按种子复现。 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机整数，范围 `[0, bound)`。 */
export const pick = (next: () => number, bound: number) => Math.floor(next() * bound);
/** 从非空数组里随机取一项。 */
export const choose = <T>(next: () => number, items: readonly T[]): T => items[pick(next, items.length)];

/** 各实体允许的字段，与 `records.ts` 的实体字段白名单一致。 */
export const entityFieldNames: Record<DataRow['entity'], string[]> = {
  AssetCategory: ['name', 'description'],
  Asset: ['name', 'status', 'purchasePrice', 'purchaseDate', 'categoryId'],
  AssetEvent: ['summary', 'cost', 'happenedAt', 'assetId']
};
const entities = Object.keys(entityFieldNames) as DataRow['entity'][];

/** 随机字段值：文本、数字、布尔或 null，覆盖「空值」与「缺失」的区别。 */
export function randomValue(next: () => number): Value {
  const kind = pick(next, 5);
  if (kind === 0) return null;
  if (kind === 1) return pick(next, 1000) / 4;
  if (kind === 2) return next() < 0.5;
  return `文本${pick(next, 6)}`;
}

/** 随机行：每个允许的字段以一半概率出现，其余缺失。 */
export function randomRow(next: () => number, entity = choose(next, entities)): DataRow {
  const fields: Record<string, Value> = {};
  for (const field of entityFieldNames[entity]) if (next() < 0.5) fields[field] = randomValue(next);
  return { entity, fields };
}

/**
 * 对记录做一次随机编辑并返回新记录（输入不被修改）：新增、改字段、新增字段、移除字段、整条删除，
 * 或把同一记录改成另一种实体。同一记录标识会被反复编辑，用来覆盖「同记录多次修改」。
 */
export function randomEdit(next: () => number, records: Records, serial: () => number): Records {
  const result = structuredClone(records);
  const ids = Object.keys(result);
  const kind = ids.length === 0 ? 0 : pick(next, 6);
  if (kind === 0) {
    result[`r${serial()}`] = randomRow(next);
    return result;
  }
  const id = choose(next, ids);
  const row = result[id];
  const names = entityFieldNames[row.entity];
  if (kind === 1) row.fields[choose(next, names)] = randomValue(next);
  else if (kind === 2) delete row.fields[choose(next, names)];
  else if (kind === 3) delete result[id];
  else if (kind === 4) result[id] = randomRow(next, choose(next, entities));
  else for (const field of names) if (next() < 0.5) row.fields[field] = randomValue(next);
  return result;
}
