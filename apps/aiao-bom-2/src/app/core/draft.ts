import { DECIMAL_CANONICAL_RE, decimalFromCanonical, decimalIsNegative } from '@aiao/rxdb-plugin-bom';
import type { BomDataset, Diagnostic, DraftState, Occurrence } from './types';
export const validQuantity = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 80 &&
  DECIMAL_CANONICAL_RE.test(value) &&
  !decimalIsNegative(decimalFromCanonical(value));
export function createDraft(dataset: BomDataset, nodes: Occurrence[]): DraftState {
  return {
    schema: 'aiao-bom-2-draft/1',
    datasetId: dataset.id,
    revision: 0,
    name: `${dataset.title} · 工作草稿`,
    nodes: nodes.map(n => ({ ...n, markets: [...n.markets], source: 'draft' })),
    savedAt: new Date().toISOString()
  };
}
export function validateDraft(draft: DraftState): Diagnostic[] {
  const result: Diagnostic[] = [];
  const nodes = new Map<string, Occurrence>();
  for (const node of draft.nodes) {
    if (nodes.has(node.key)) result.push({ key: node.key, field: 'key', message: '发生位置身份重复' });
    nodes.set(node.key, node);
    if (node.kind !== 'system' && (node.quantity === null || node.quantityState !== 'confirmed'))
      result.push({
        key: node.key,
        field: 'quantity',
        message: node.quantity === null ? '用量缺失' : '参考用量尚未确认'
      });
    if (node.quantity !== null && !validQuantity(node.quantity))
      result.push({ key: node.key, field: 'quantity', message: '用量必须是非负规范十进制字符串' });
    if (!node.uom.trim() && node.kind !== 'system') result.push({ key: node.key, field: 'uom', message: '单位缺失' });
  }
  const checked = new Set<string>();
  for (const node of nodes.values()) checkParent(node, nodes, checked, result);
  return result;
}
function checkParent(
  node: Occurrence,
  nodes: Map<string, Occurrence>,
  checked: Set<string>,
  issues: Diagnostic[]
): void {
  const path = new Set<string>();
  let current: Occurrence | undefined = node;
  while (current && !checked.has(current.key)) {
    if (path.has(current.key)) {
      issues.push({ key: node.key, field: 'parentKey', message: '父子关系存在循环' });
      break;
    }
    path.add(current.key);
    if (current.parentKey && !nodes.has(current.parentKey)) {
      issues.push({ key: current.key, field: 'parentKey', message: '父发生位置不存在' });
      break;
    }
    current = current.parentKey ? nodes.get(current.parentKey) : undefined;
  }
  for (const key of path) checked.add(key);
}
const states = new Set(['missing', 'ambiguous', 'reference', 'confirmed']);
function parseNode(raw: unknown, index: number): Occurrence {
  if (!raw || typeof raw !== 'object') throw new Error(`第 ${index + 1} 行必须是对象`);
  const n = raw as Record<string, unknown>;
  for (const field of ['key', 'partId', 'compId', 'uom', 'sourceRef'])
    if (typeof n[field] !== 'string') throw new Error(`第 ${index + 1} 行 ${field} 必须是字符串`);
  if (!n['key'] || !n['partId']) throw new Error(`第 ${index + 1} 行身份不能为空`);
  if (n['parentKey'] !== null && typeof n['parentKey'] !== 'string') throw new Error('parentKey 必须是字符串或 null');
  if (n['quantity'] !== null && typeof n['quantity'] !== 'string')
    throw new Error('quantity 必须是十进制字符串或 null');
  if (!['part', 'system', 'assembly'].includes(String(n['kind'])) || !states.has(String(n['quantityState'])))
    throw new Error('节点类型或数量状态非法');
  if (!Array.isArray(n['markets']) || n['markets'].some(m => !['EU', 'CN', 'US', 'AU'].includes(m)))
    throw new Error('市场列表非法');
  if (n['nodeIndex'] !== undefined && (!Number.isSafeInteger(n['nodeIndex']) || Number(n['nodeIndex']) < 0))
    throw new Error('模型节点索引非法');
  if (n['label'] !== undefined && typeof n['label'] !== 'string') throw new Error('label 必须是字符串');
  if (n['unitCost'] != null && !validQuantity(n['unitCost'])) throw new Error('单位成本必须是非负十进制字符串');
  return {
    key: String(n['key']),
    parentKey: n['parentKey'] as string | null,
    partId: String(n['partId']),
    compId: String(n['compId']),
    uom: String(n['uom']),
    sourceRef: String(n['sourceRef']),
    source: 'draft',
    quantity: n['quantity'] as string | null,
    quantityState: n['quantityState'] as Occurrence['quantityState'],
    kind: n['kind'] as Occurrence['kind'],
    markets: n['markets'] as Occurrence['markets'],
    label: n['label'] as string | undefined,
    unitCost: n['unitCost'] as string | null | undefined,
    nodeIndex: n['nodeIndex'] as number | undefined
  };
}
export function parseImport(text: string): DraftState {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object') throw new Error('必须导入 BOM 草稿对象');
  const value = raw as Record<string, unknown>;
  if (
    value['schema'] !== 'aiao-bom-2-draft/1' ||
    !Array.isArray(value['nodes']) ||
    typeof value['datasetId'] !== 'string' ||
    typeof value['name'] !== 'string'
  )
    throw new Error('文件不是 aiao-bom-2/1 草稿格式');
  if (value['nodes'].length > 100000) throw new Error('单次导入最多 100000 个发生位置');
  const draft: DraftState = {
    schema: 'aiao-bom-2-draft/1',
    datasetId: value['datasetId'],
    name: value['name'],
    revision:
      typeof value['revision'] === 'number' && Number.isSafeInteger(value['revision']) && value['revision'] >= 0 ?
        value['revision']
      : 0,
    savedAt: new Date().toISOString(),
    nodes: value['nodes'].map(parseNode)
  };
  const invalid = validateDraft(draft).filter(
    i => i.field === 'parentKey' || i.field === 'key' || i.message.includes('规范')
  );
  if (invalid.length)
    throw new Error(
      invalid
        .slice(0, 5)
        .map(i => `${i.key}：${i.message}`)
        .join('\n')
    );
  return draft;
}
export class DraftHistory {
  private undoStack: DraftState[] = [];
  private redoStack: DraftState[] = [];
  current: DraftState;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  constructor(initial: DraftState) {
    this.current = initial;
  }
  patch(
    keys: string[],
    patch: Partial<Pick<Occurrence, 'quantity' | 'uom' | 'quantityState' | 'unitCost' | 'label'>>
  ): void {
    if (patch.quantity !== undefined && patch.quantity !== null && !validQuantity(patch.quantity))
      throw new Error('用量必须是非负规范十进制字符串');
    if (patch.unitCost !== undefined && patch.unitCost !== null && !validQuantity(patch.unitCost))
      throw new Error('单位成本格式非法');
    if (patch.uom !== undefined && !patch.uom.trim()) throw new Error('单位不能为空');
    const selected = new Set(keys);
    this.commit(this.current.nodes.map(n => (selected.has(n.key) ? { ...n, ...patch } : n)));
  }
  add(parentKey: string | null, partId: string, quantity: string, uom: string): void {
    if (parentKey && !this.current.nodes.some(n => n.key === parentKey)) throw new Error('父发生位置不存在');
    if (!partId.trim() || !uom.trim() || !validQuantity(quantity)) throw new Error('件号、单位和规范用量必填');
    this.commit([
      ...this.current.nodes,
      {
        key: `draft:${crypto.randomUUID()}`,
        parentKey,
        partId,
        compId: partId,
        quantity,
        uom,
        quantityState: 'confirmed',
        kind: 'part',
        source: 'draft',
        markets: [],
        sourceRef: '手工新增'
      }
    ]);
  }
  remove(keys: string[]): void {
    const removed = new Set(keys);
    const children = new Map<string, string[]>();
    for (const node of this.current.nodes) {
      if (!node.parentKey) continue;
      const siblings = children.get(node.parentKey) ?? [];
      siblings.push(node.key);
      children.set(node.parentKey, siblings);
    }
    const queue = [...keys];
    while (queue.length)
      for (const child of children.get(queue.pop()!) ?? []) {
        removed.add(child);
        queue.push(child);
      }
    this.commit(this.current.nodes.filter(n => !removed.has(n.key)));
  }
  move(key: string, parentKey: string | null): void {
    const node = this.current.nodes.find(n => n.key === key);
    if (!node) throw new Error('发生位置不存在');
    const nodes = this.current.nodes.map(n => (n.key === key ? { ...n, parentKey } : n));
    const issues = validateDraft({ ...this.current, nodes }).filter(i => i.field === 'parentKey');
    if (issues.length) throw new Error(issues[0].message);
    this.commit(nodes);
  }
  restore(nodes: Occurrence[]): void {
    this.commit(nodes);
  }
  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.current);
    this.current = previous;
  }
  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.current);
    this.current = next;
  }
  private commit(nodes: Occurrence[]): void {
    this.undoStack.push(this.current);
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack = [];
    this.current = { ...this.current, nodes, revision: this.current.revision + 1, savedAt: new Date().toISOString() };
  }
}
function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(
  nodes: Pick<
    Occurrence,
    'key' | 'parentKey' | 'partId' | 'label' | 'compId' | 'quantity' | 'quantityState' | 'uom' | 'sourceRef'
  >[]
): string {
  const fields = [
    'key',
    'parentKey',
    'partId',
    'label',
    'compId',
    'quantity',
    'quantityState',
    'uom',
    'sourceRef'
  ] as const;
  return '\uFEFF' + [fields.join(','), ...nodes.map(n => fields.map(f => csvCell(n[f])).join(','))].join('\r\n');
}
export type DraftChangeField =
  'quantity' | 'quantityState' | 'uom' | 'unitCost' | 'parentKey' | 'partId' | 'compId' | 'label' | 'markets';
export interface DraftChange {
  key: string;
  kind: 'added' | 'removed' | 'changed';
  fields: DraftChangeField[];
  before: Occurrence | null;
  after: Occurrence | null;
}
export function compareDraftsDetailed(before: DraftState, after: DraftState): DraftChange[] {
  const changes: DraftChange[] = [];
  const previous = new Map(before.nodes.map(node => [node.key, node]));
  for (const node of after.nodes) {
    const old = previous.get(node.key);
    if (!old) {
      changes.push({ key: node.key, kind: 'added', fields: [], before: null, after: node });
      continue;
    }
    const fields: DraftChangeField[] = [];
    if (old.quantity !== node.quantity) fields.push('quantity');
    if (old.quantityState !== node.quantityState) fields.push('quantityState');
    if (old.uom !== node.uom) fields.push('uom');
    if ((old.unitCost ?? null) !== (node.unitCost ?? null)) fields.push('unitCost');
    if (old.parentKey !== node.parentKey) fields.push('parentKey');
    if (old.partId !== node.partId) fields.push('partId');
    if (old.compId !== node.compId) fields.push('compId');
    if ((old.label ?? '') !== (node.label ?? '')) fields.push('label');
    if ([...old.markets].sort().join(',') !== [...node.markets].sort().join(',')) fields.push('markets');
    if (fields.length) changes.push({ key: node.key, kind: 'changed', fields, before: old, after: node });
    previous.delete(node.key);
  }
  for (const node of previous.values())
    changes.push({ key: node.key, kind: 'removed', fields: [], before: node, after: null });
  return changes;
}
export function compareDrafts(
  before: DraftState,
  after: DraftState
): Array<{ key: string; field: string; before: string; after: string }> {
  const changes: Array<{ key: string; field: string; before: string; after: string }> = [];
  const previous = new Map(before.nodes.map(n => [n.key, n]));
  for (const node of after.nodes) {
    const old = previous.get(node.key);
    if (!old) {
      changes.push({ key: node.key, field: '新增', before: '', after: node.partId });
      continue;
    }
    for (const field of ['quantity', 'uom', 'parentKey', 'partId', 'unitCost'] as const)
      if (old[field] !== node[field])
        changes.push({ key: node.key, field, before: String(old[field] ?? ''), after: String(node[field] ?? '') });
    previous.delete(node.key);
  }
  for (const node of previous.values()) changes.push({ key: node.key, field: '删除', before: node.partId, after: '' });
  return changes;
}
