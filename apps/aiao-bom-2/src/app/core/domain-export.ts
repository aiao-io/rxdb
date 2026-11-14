import { parseImportPayload, validateImportRecords } from '@aiao/rxdb-plugin-bom';
import { validateDraft } from './draft';
import type { DraftState, Occurrence } from './types';

export interface DomainDraftOptions {
  rootKey: string;
  revisionNo: string;
  orgId: string;
  effectiveFrom: string;
  confirmed: boolean;
}
export interface DomainDraftEnvelope {
  name: string;
  datasetId: string;
  rootItemNo: string;
  revisionNo: string;
  orgId: string;
  records: Record<string, unknown>[];
  identities: { key: string; sourceRef: string; parentItemNo: string; lineNo: number }[];
}
export function prepareDomainDraft(draft: DraftState, options: DomainDraftOptions): DomainDraftEnvelope {
  if (!options.confirmed) throw new Error('请先确认所选范围的父子关系与用量已经人工核对');
  const date = new Date(`${options.effectiveFrom}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== options.effectiveFrom)
    throw new Error('生效日期无效');
  if (!options.revisionNo.trim() || !options.orgId.trim()) throw new Error('修订号与组织不能为空');
  const byKey = new Map(draft.nodes.map(node => [node.key, node]));
  const root = byKey.get(options.rootKey);
  if (!root) throw new Error('请选择实际装配作为领域 BOM 根项');
  const children = new Map<string, Occurrence[]>();
  for (const node of draft.nodes) {
    if (!node.parentKey) continue;
    const group = children.get(node.parentKey) ?? [];
    group.push(node);
    children.set(node.parentKey, group);
  }
  const nodes: Occurrence[] = [];
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.key)) throw new Error(`发生位置存在环或重复：${node.key}`);
    seen.add(node.key);
    nodes.push(node);
    stack.push(...(children.get(node.key) ?? []).toReversed());
  }
  if (nodes.some(node => node.kind === 'system'))
    throw new Error('系统分类不能转换为制造关系，请选择实际装配并整理草稿');
  if (!children.get(root.key)?.length) throw new Error('所选根项没有子项');
  if (nodes.some(node => node.quantityState !== 'confirmed' || node.quantity === null))
    throw new Error('范围内存在未确认用量，不能进入领域库');
  const issues = validateDraft({
    ...draft,
    nodes: nodes.map(node => (node === root ? { ...node, parentKey: null } : node))
  });
  if (issues.length) throw new Error(issues.map(issue => `${issue.key}：${issue.message}`).join('；'));
  return recordsFor(draft, nodes, children, options);
}
function recordsFor(
  draft: DraftState,
  nodes: Occurrence[],
  children: Map<string, Occurrence[]>,
  options: DomainDraftOptions
): DomainDraftEnvelope {
  const items = new Map<string, Occurrence>();
  const definitions = new Map<string, string>();
  let inconsistent = '';
  const records: Record<string, unknown>[] = [];
  const identities: DomainDraftEnvelope['identities'] = [];
  for (const node of nodes) {
    const previous = items.get(node.partId);
    if (previous && previous.uom !== node.uom) throw new Error(`同物料单位不一致：${node.partId}`);
    if (!previous)
      records.push(
        { kind: 'item', source_ref: node.sourceRef, itemNo: node.partId, stockUom: node.uom },
        { kind: 'revision', source_ref: node.key, itemNo: node.partId, revisionNo: options.revisionNo, state: 'draft' }
      );
    items.set(node.partId, node);
    const branches = children.get(node.key) ?? [];
    const signature = JSON.stringify(branches.map(child => [child.partId, child.quantity, child.uom]));
    if (definitions.has(node.partId) && definitions.get(node.partId) !== signature) inconsistent = node.partId;
    const first = !definitions.has(node.partId);
    definitions.set(node.partId, signature);
    const parent = {
      itemNo: node.partId,
      revisionNo: options.revisionNo,
      bomType: 'ebom',
      orgId: options.orgId,
      alternativeNo: 1
    };
    if (first && branches.length)
      records.push({
        ...parent,
        kind: 'header',
        source_ref: node.key,
        state: 'draft',
        baseUom: node.uom,
        baseQty: '1',
        assemblyScrap: '0'
      });
    branches.forEach((child, index) => {
      const lineNo = (index + 1) * 10;
      identities.push({ key: child.key, sourceRef: child.sourceRef, parentItemNo: node.partId, lineNo });
      if (first)
        records.push(
          { ...parent, kind: 'line', source_ref: child.key, lineNo },
          {
            ...parent,
            kind: 'occurrence',
            source_ref: child.key,
            lineNo,
            effectiveFrom: options.effectiveFrom,
            childItemNo: child.partId,
            qty: child.quantity,
            uom: child.uom
          }
        );
    });
  }
  const validation = validateImportRecords(parseImportPayload(records), {
    items: new Set(),
    revisions: new Set(),
    headers: new Set(),
    lines: new Set(),
    occurrences: new Set()
  });
  if (!validation.ok) throw new Error(validation.diagnostics.map(issue => issue.message).join('；'));
  if (inconsistent) throw new Error(`同物料存在不同子结构：${inconsistent}，请先明确修订身份`);
  return {
    name: draft.name,
    datasetId: draft.datasetId,
    rootItemNo: nodes[0].partId,
    revisionNo: options.revisionNo,
    orgId: options.orgId,
    records,
    identities
  };
}
