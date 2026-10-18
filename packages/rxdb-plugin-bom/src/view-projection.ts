import type { BomViewCandidate, BomViewInput, BomViewNode, BomViewSnapshot } from './view-types.js';

export const viewPathKey = (path: readonly string[]): string => JSON.stringify(path);

export const viewCandidates = (snapshot: BomViewSnapshot): BomViewCandidate[] => {
  const groups = new Map<string, BomViewCandidate>();
  const items = new Map(snapshot.items.map(item => [item.id, item.itemNo]));
  const unresolved = [...(snapshot.expansion.unresolved ?? []), ...(snapshot.explosion?.manifest.unresolved ?? [])];
  for (const group of unresolved) {
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
  for (const group of snapshot.explosion?.unresolved ?? []) {
    groups.set(`manual:${group.groupCode}`, {
      key: `manual:${group.groupCode}`,
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
