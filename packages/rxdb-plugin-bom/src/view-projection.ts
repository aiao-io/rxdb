import type { BomViewCandidate, BomViewInput, BomViewNode, BomViewSnapshot } from './view-types.js';

export const viewPathKey = (path: readonly string[]): string => JSON.stringify(path);

type CandidateSource = Pick<BomViewSnapshot, 'expansion' | 'explosion'>;

/**
 * 视图展示的未裁决候选：结构侧（备选 / 序列 / 批次）与 manual 替代组。
 * 结构侧由展开与爆炸两遍各自报告，预算截断时两遍可能发散，因此两份都要合入。
 */
const candidateGroups = ({ expansion, explosion }: CandidateSource) => ({
  structural: [...(expansion.unresolved ?? []), ...(explosion?.manifest.unresolved ?? [])],
  manual: explosion?.unresolved ?? []
});

/** 需要显示信息的物料：展开节点与全部候选子件。与 {@link viewCandidates} 同源，保证每个候选都取到物料行。 */
export const viewItemIds = (source: CandidateSource): string[] => {
  const { structural, manual } = candidateGroups(source);
  return [
    ...new Set([
      ...source.expansion.nodes.map(node => node.itemId),
      ...structural.flatMap(group =>
        group.candidates.flatMap(candidate => (candidate.childItemId === undefined ? [] : [candidate.childItemId]))
      ),
      ...manual.flatMap(group => group.candidates.map(candidate => candidate.itemId))
    ])
  ];
};

export const viewCandidates = (snapshot: BomViewSnapshot): BomViewCandidate[] => {
  const groups = new Map<string, BomViewCandidate>();
  const items = new Map(snapshot.items.map(item => [item.id, item.itemNo]));
  const { structural, manual } = candidateGroups(snapshot);
  for (const group of structural) {
    const key = `${group.reason ?? 'alternative'}:${group.parentRevisionId}:${group.lineId ?? ''}`;
    groups.set(key, {
      key,
      kind: group.reason ?? 'alternative',
      candidates: group.candidates.map(candidate => ({
        key: candidate.occurrenceId ?? candidate.headerId,
        label:
          candidate.childItemId === undefined ? `备选 ${candidate.alternativeNo}` : items.get(candidate.childItemId)!
      }))
    });
  }
  for (const group of manual) {
    groups.set(`manual:${group.groupId}`, {
      key: `manual:${group.groupId}`,
      kind: 'manual',
      candidates: group.candidates.map(candidate => ({
        key: candidate.occurrenceId,
        label: items.get(candidate.itemId)!
      }))
    });
  }
  return [...groups.values()];
};

export const projectViewNodes = (
  snapshot: BomViewSnapshot,
  input: BomViewInput,
  expanded: ReadonlySet<string>
): BomViewNode[] => {
  const items = new Map(snapshot.items.map(item => [item.id, item]));
  const quantities = new Map(
    snapshot.explosion?.requirementLines.map(line => [
      viewPathKey(line.path),
      {
        value: line.qty,
        uom: line.uom
      }
    ])
  );
  for (const line of snapshot.explosion?.penetrations ?? []) quantities.set(viewPathKey(line.path), line.converted);
  quantities.set(viewPathKey([]), input.plannedQty);
  const complete = viewCandidates(snapshot).length === 0;
  const children = new Map<string, BomViewNode[]>();
  const roots: BomViewNode[] = [];
  for (const node of snapshot.expansion.nodes) {
    const key = viewPathKey(node.path);
    const item = items.get(node.itemId)!;
    const projected: BomViewNode = {
      ...node,
      key,
      itemNo: item.itemNo,
      description: item.description,
      quantity: complete ? (quantities.get(key) ?? null) : null,
      hasChildren: false,
      expanded: expanded.has(key)
    };
    if (node.depth === 0) roots.push(projected);
    else {
      const parent = viewPathKey(node.path.slice(0, -1));
      const siblings = children.get(parent) ?? [];
      siblings.push(projected);
      children.set(parent, siblings);
    }
  }
  const result: BomViewNode[] = [];
  const visit = (node: BomViewNode): void => {
    const descendants = children.get(node.key) ?? [];
    node.hasChildren = descendants.length > 0;
    result.push(node);
    if (node.expanded) descendants.forEach(visit);
  };
  roots.forEach(visit);
  return result;
};
