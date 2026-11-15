export interface ModelNodeIdentity {
  index: number;
  partId: string;
  compId: string;
  systemId: string;
}
export function partGroup(id: string): string {
  return id.match(/^(\d{7}|Q\d{6})/)?.[1] ?? id;
}
export function selectModelNodes(
  nodes: ModelNodeIdentity[],
  selection: { partId: string; compId: string; nodeIndex?: number }
) {
  if (selection.nodeIndex !== undefined) return { indices: [selection.nodeIndex], level: 'occurrence' as const };
  const exact = nodes.filter(n => n.compId === selection.compId);
  if (exact.length) return { indices: exact.map(n => n.index), level: 'variant' as const };
  const group = nodes.filter(n => n.partId === selection.partId);
  return { indices: group.map(n => n.index), level: group.length ? ('group' as const) : ('none' as const) };
}
