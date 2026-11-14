import { decimalFromCanonical, decimalSub, decimalToCanonical } from '@aiao/rxdb-plugin-bom';
import { validQuantity } from './draft';
import { MARKETS, type Occurrence, type Structure } from './types';

export interface BomSnapshot {
  schema: 'aiao-bom-2-snapshot/1';
  id: string;
  datasetId: string;
  name: string;
  source: 'dataset' | 'draft';
  structure: Structure;
  version: string;
  evaluationDate: string;
  observedOn: string;
  savedAt: string;
  nodes: Occurrence[];
}
export type BomSnapshotMeta = Omit<BomSnapshot, 'nodes'> & { nodeCount: number };
export type SnapshotChangeField = 'replacement' | 'parent' | 'quantity' | 'quantityState' | 'uom' | 'unitCost' | 'label' | 'markets' | 'identity';
export interface SnapshotChange {
  key: string;
  kind: 'added' | 'removed' | 'changed';
  fields: SnapshotChangeField[];
  before: Occurrence | null;
  after: Occurrence | null;
  quantityDelta: string | null;
}
export interface SnapshotDiff {
  schema: 'aiao-bom-2-snapshot-diff/1';
  datasetId: string;
  structure: Structure;
  before: BomSnapshotMeta;
  after: BomSnapshotMeta;
  dateOrder: 'before' | 'same' | 'after';
  unconfirmedQuantities: { before: number; after: number };
  summary: { added: number; removed: number; changed: number; quantityChanges: number; replacements: number; moved: number; otherChanges: number };
  changes: SnapshotChange[];
}
const STRUCTURES: Structure[] = ['catalog', 'purchase', 'cad', 'draft'];
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: Record<string, unknown>, key: string, allowEmpty = false): string => {
  const field = value[key];
  if (typeof field !== 'string' || (!allowEmpty && !field.trim())) throw new Error(`快照字段 ${key} 必须是${allowEmpty ? '' : '非空'}字符串`);
  return field;
};
const enumValue = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error('快照枚举字段非法');
  return value as T;
};
export const isSnapshotDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const parseMeta = (value: Record<string, unknown>): Omit<BomSnapshot, 'nodes'> => {
  if (value['schema'] !== 'aiao-bom-2-snapshot/1') throw new Error('快照格式不受支持');
  const evaluationDate = text(value, 'evaluationDate');
  const observedOn = text(value, 'observedOn');
  const savedAt = text(value, 'savedAt');
  if (!isSnapshotDate(evaluationDate) || !isSnapshotDate(observedOn)) throw new Error('快照日期必须是有效的 YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(savedAt) || !Number.isFinite(Date.parse(savedAt)) || new Date(savedAt).toISOString() !== savedAt) throw new Error('快照保存时间格式非法');
  return {
    schema: 'aiao-bom-2-snapshot/1', id: text(value, 'id'), datasetId: text(value, 'datasetId'), name: text(value, 'name').trim(),
    source: enumValue(value['source'], ['dataset', 'draft']), structure: enumValue(value['structure'], STRUCTURES),
    version: text(value, 'version', true), evaluationDate, observedOn, savedAt
  };
};
export const parseSnapshotMeta = (value: unknown): BomSnapshotMeta => {
  if (!record(value)) throw new Error('快照目录格式非法');
  if (!Number.isSafeInteger(value['nodeCount']) || Number(value['nodeCount']) < 0 || Number(value['nodeCount']) > 100000) throw new Error('快照节点数非法');
  return { ...parseMeta(value), nodeCount: Number(value['nodeCount']) };
};
const optionalFields = (value: Record<string, unknown>): Pick<Occurrence, 'label' | 'nodeIndex' | 'unitCost'> => {
  if (value['label'] !== undefined && typeof value['label'] !== 'string') throw new Error('快照 label 必须是字符串');
  if (value['nodeIndex'] !== undefined && (!Number.isSafeInteger(value['nodeIndex']) || Number(value['nodeIndex']) < 0)) throw new Error('快照模型节点索引非法');
  if (value['unitCost'] != null && !validQuantity(value['unitCost'])) throw new Error('快照成本必须是非负规范十进制字符串');
  return {
    ...(value['label'] !== undefined ? { label: value['label'] as string } : {}),
    ...(value['nodeIndex'] !== undefined ? { nodeIndex: value['nodeIndex'] as number } : {}),
    ...(value['unitCost'] !== undefined ? { unitCost: value['unitCost'] as string | null } : {})
  };
};
const parseOccurrence = (value: unknown): Occurrence => {
  if (!record(value)) throw new Error('快照发生位置格式非法');
  const markets = value['markets'];
  if (!Array.isArray(markets) || markets.some(item => !MARKETS.includes(item)) || new Set(markets).size !== markets.length) throw new Error('快照市场字段非法');
  if (value['quantity'] !== null && !validQuantity(value['quantity'])) throw new Error('快照数量必须是非负规范十进制字符串或 null');
  return {
    key: text(value, 'key'), parentKey: value['parentKey'] === null ? null : text(value, 'parentKey'),
    partId: text(value, 'partId'), compId: text(value, 'compId', true), uom: text(value, 'uom', true), sourceRef: text(value, 'sourceRef', true),
    kind: enumValue(value['kind'], ['part', 'system', 'assembly']), source: enumValue(value['source'], STRUCTURES),
    quantity: value['quantity'] as string | null, quantityState: enumValue(value['quantityState'], ['missing', 'ambiguous', 'reference', 'confirmed']),
    markets: [...markets], ...optionalFields(value)
  };
};
const validateParents = (nodes: Occurrence[]): void => {
  const byKey = new Map(nodes.map(node => [node.key, node]));
  if (byKey.size !== nodes.length) throw new Error('快照包含重复发生位置');
  const checked = new Set<string>();
  for (const node of nodes) checkChain(node, byKey, checked);
};
const checkChain = (node: Occurrence, byKey: Map<string, Occurrence>, checked: Set<string>): void => {
  let current: Occurrence | undefined = node;
  const path = new Set<string>();
  while (current && !checked.has(current.key)) {
    if (path.has(current.key)) throw new Error(`快照父链存在循环：${current.key}`);
    path.add(current.key);
    if (current.parentKey !== null && !byKey.has(current.parentKey)) throw new Error(`快照父位置不存在：${current.parentKey}`);
    current = current.parentKey === null ? undefined : byKey.get(current.parentKey);
  }
  for (const key of path) checked.add(key);
};
export const parseSnapshot = (value: unknown): BomSnapshot => {
  if (!record(value) || !Array.isArray(value['nodes'])) throw new Error('快照格式不受支持');
  const meta = parseMeta(value);
  if (value['nodes'].length > 100000) throw new Error('单份快照最多 100000 个发生位置');
  const nodes = value['nodes'].map(parseOccurrence);
  validateParents(nodes);
  return { ...meta, nodes };
};
export const createSnapshot = (input: Omit<BomSnapshot, 'schema' | 'nodes'> & { nodes: readonly Occurrence[] }): BomSnapshot => parseSnapshot({ ...input, schema: 'aiao-bom-2-snapshot/1' });
export const snapshotListItem = (snapshot: BomSnapshot): BomSnapshotMeta => {
  const { nodes, ...meta } = snapshot;
  return { ...meta, nodeCount: nodes.length };
};
const changedFields = (before: Occurrence, after: Occurrence): SnapshotChangeField[] => {
  const fields: SnapshotChangeField[] = [];
  if (before.partId !== after.partId || before.compId !== after.compId) fields.push('replacement');
  if (before.parentKey !== after.parentKey) fields.push('parent');
  if (before.quantity !== after.quantity) fields.push('quantity');
  if (before.quantityState !== after.quantityState) fields.push('quantityState');
  if (before.uom !== after.uom) fields.push('uom');
  if ((before.unitCost ?? null) !== (after.unitCost ?? null)) fields.push('unitCost');
  if ((before.label ?? '') !== (after.label ?? '')) fields.push('label');
  if ([...before.markets].sort().join(',') !== [...after.markets].sort().join(',')) fields.push('markets');
  if (before.kind !== after.kind || before.source !== after.source || before.sourceRef !== after.sourceRef || before.nodeIndex !== after.nodeIndex) fields.push('identity');
  return fields;
};
const quantityDelta = (before: Occurrence, after: Occurrence): string | null => {
  if (before.quantity === null || after.quantity === null || before.quantityState !== 'confirmed' || after.quantityState !== 'confirmed' || before.uom !== after.uom) return null;
  return decimalToCanonical(decimalSub(decimalFromCanonical(after.quantity), decimalFromCanonical(before.quantity)));
};
const changed = (before: Occurrence, after: Occurrence): SnapshotChange | null => {
  const fields = changedFields(before, after);
  return fields.length ? { key: after.key, kind: 'changed', fields, before, after, quantityDelta: quantityDelta(before, after) } : null;
};
const changesBetween = (before: Occurrence[], after: Occurrence[]): SnapshotChange[] => {
  const previous = new Map(before.map(node => [node.key, node]));
  const changes: SnapshotChange[] = [];
  for (const node of after) {
    const old = previous.get(node.key);
    const change = old ? changed(old, node) : { key: node.key, kind: 'added' as const, fields: [], before: null, after: node, quantityDelta: null };
    if (change) changes.push(change);
    previous.delete(node.key);
  }
  for (const node of previous.values()) changes.push({ key: node.key, kind: 'removed', fields: [], before: node, after: null, quantityDelta: null });
  return changes;
};
const summarize = (changes: SnapshotChange[]): SnapshotDiff['summary'] => ({
  added: changes.filter(change => change.kind === 'added').length,
  removed: changes.filter(change => change.kind === 'removed').length,
  changed: changes.filter(change => change.kind === 'changed').length,
  quantityChanges: changes.filter(change => change.fields.includes('quantity')).length,
  replacements: changes.filter(change => change.fields.includes('replacement')).length,
  moved: changes.filter(change => change.fields.includes('parent')).length,
  otherChanges: changes.filter(change => change.fields.some(field => !['quantity', 'replacement', 'parent'].includes(field))).length
});
const unconfirmed = (nodes: Occurrence[]): number => nodes.filter(node => node.kind !== 'system' && (node.quantity === null || node.quantityState !== 'confirmed' || !node.uom.trim())).length;
export const compareSnapshots = (before: BomSnapshot, after: BomSnapshot): SnapshotDiff => {
  if (before.datasetId !== after.datasetId) throw new Error('只能比较同一产品数据集的快照');
  if (before.structure !== after.structure) throw new Error('只能比较同一结构来源的快照');
  const left = parseSnapshot(before);
  const right = parseSnapshot(after);
  const changes = changesBetween(left.nodes, right.nodes);
  return {
    schema: 'aiao-bom-2-snapshot-diff/1', datasetId: left.datasetId, structure: left.structure,
    before: snapshotListItem(left), after: snapshotListItem(right),
    dateOrder: left.evaluationDate < right.evaluationDate ? 'before' : left.evaluationDate > right.evaluationDate ? 'after' : 'same',
    unconfirmedQuantities: { before: unconfirmed(left.nodes), after: unconfirmed(right.nodes) }, summary: summarize(changes), changes
  };
};
