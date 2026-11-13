import { decimalAdd, decimalCmp, decimalFromCanonical, decimalToCanonical } from '@aiao/rxdb-plugin-bom';
import type { BomDataset, BomRow, Occurrence, Part, QueryResult, QuerySpec, Structure } from './types';
const collator = new Intl.Collator('zh-CN', { numeric: true });
export class BomIndex {
  private readonly queryCache = new Map<string, QueryResult>();
  private readonly searchText = new Map<string, string>();
  private readonly metadata = new Map<string, { depth: number; path: string }>();
  readonly nodes: Map<string, Occurrence>;
  readonly parts: Map<string, Part>;
  readonly children = new Map<string | null, Occurrence[]>();
  readonly rows = new Map<string, BomRow>();

  constructor(readonly dataset: BomDataset, readonly structure: Structure, prepared?: BomRow[]) {
    this.parts = new Map(dataset.parts.map(p => [p.id, p]));
    this.nodes = new Map(dataset.structures[structure].map(n => [n.key, n]));
    for (const node of this.nodes.values()) {
      const siblings = this.children.get(node.parentKey) ?? [];
      siblings.push(node);
      this.children.set(node.parentKey, siblings);
    }
    if (prepared) for (const row of prepared) { this.rows.set(row.key, row); this.indexSearch(this.nodes.get(row.key)!, row.name); }
    else for (const node of this.nodes.values()) this.rows.set(node.key, this.project(node));
  }

  ancestors(key: string): Occurrence[] {
    const result: Occurrence[] = [];
    const seen = new Set([key]);
    let node = this.nodes.get(key);
    while (node?.parentKey) {
      if (seen.has(node.parentKey)) throw new Error(`循环结构：${key}`);
      seen.add(node.parentKey);
      node = this.nodes.get(node.parentKey);
      if (!node) break;
      result.push(node);
      if (result.length >= 512) break;
    }
    return result.reverse();
  }

  descendants(key: string): Set<string> {
    const result = new Set<string>();
    const queue = [key];
    while (queue.length) {
      const next = queue.pop()!;
      if (result.has(next)) continue;
      result.add(next);
      for (const child of this.children.get(next) ?? []) queue.push(child.key);
    }
    return result;
  }

  query(spec: QuerySpec): QueryResult {
    const cacheKey = JSON.stringify(spec); const cached = this.queryCache.get(cacheKey);
    if (cached) return cached;
    if (spec.scope !== null && !this.nodes.has(spec.scope)) throw new Error('当前范围不存在');
    const scope = spec.scope ? this.descendants(spec.scope) : null;
    const matches = this.matching(spec, scope);
    const included = new Set(matches);
    if (spec.mode === 'tree') this.includeAncestors(matches, included, spec.scope);
    const scopeDepth = spec.scope ? this.rows.get(spec.scope)!.depth : 0;
    const allRows = [...included].map(key => this.rows.get(key)!).filter(Boolean);
    const rows = spec.mode === 'tree' ? allRows.filter(row => row.depth - scopeDepth < 128) : allRows;
    const truncated = rows.length !== allRows.length;
    const byParent = new Map<string | null, BomRow[]>();
    for (const row of rows) {
      const parent = row.key === spec.scope ? null : row.parentKey;
      const children = byParent.get(parent) ?? [];
      children.push(row);
      byParent.set(parent, children);
    }
    const compare = this.comparator(spec);
    if (spec.sort !== 'source') for (const children of byParent.values()) children.sort(compare);
    const projected = spec.mode === 'summary' ? this.summarize([...matches].map(key => this.rows.get(key)!)) : rows;
    if (spec.mode !== 'tree' && spec.sort !== 'source') projected.sort(compare);
    const result = { roots: spec.mode === 'tree' ? byParent.get(null) ?? [] : projected, rows: projected, byParent, total: this.nodes.size, matched: matches.size, truncated };
    this.queryCache.set(cacheKey, result);
    if (this.queryCache.size > 6) this.queryCache.delete(this.queryCache.keys().next().value!);
    return result;
  }

  private matching(spec: QuerySpec, scope: Set<string> | null): Set<string> {
    const result = new Set<string>();
    const terms = spec.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    for (const node of this.nodes.values()) {
      if (scope && !scope.has(node.key)) continue;
      if (this.matches(node, spec, terms)) result.add(node.key);
    }
    return result;
  }

  private matches(node: Occurrence, spec: QuerySpec, terms: string[]): boolean {
    const p = this.parts.get(node.partId);
    const row = this.rows.get(node.key)!;
    if (this.structure === 'catalog' && node.kind !== 'system' && !spec.includeCatalog && !p?.inBom) return false;
    if (spec.market && node.markets.length > 0 && !node.markets.includes(spec.market)) return false;
    if (terms.some(t => !this.searchText.get(node.key)!.includes(t))) return false;
    if (spec.only3d && !row.has3d) return false;
    if (spec.issue === 'conflict') return Boolean(p?.conflict);
    if (spec.issue === 'quantity') return node.kind !== 'system' && (node.quantity === null || node.quantityState === 'ambiguous');
    if (spec.issue === 'unmapped') return node.kind !== 'system' && !row.has3d;
    return true;
  }

  private includeAncestors(matches: Set<string>, included: Set<string>, scope: string | null): void {
    for (const key of matches) {
      let parent = this.nodes.get(key)?.parentKey;
      while (parent && !included.has(parent)) {
        if (key === scope) break;
        included.add(parent);
        if (parent === scope) break;
        parent = this.nodes.get(parent)?.parentKey;
      }
    }
  }

  private comparator(spec: QuerySpec): (a: BomRow, b: BomRow) => number {
    const direction = spec.descending ? -1 : 1;
    return (a, b) => {
      if (spec.sort === 'quantity') {
        if (a.quantity === null) return b.quantity === null ? 0 : 1;
        if (b.quantity === null) return -1;
        return decimalCmp(decimalFromCanonical(a.quantity), decimalFromCanonical(b.quantity)) * direction;
      }
      return collator.compare(spec.sort === 'name' ? a.name : a.partId, spec.sort === 'name' ? b.name : b.partId) * direction;
    };
  }

  private project(n: Occurrence): BomRow {
    const p = this.parts.get(n.partId);
    const { depth, path } = this.describe(n);
    const label = n.label || p?.name || n.partId;
    this.indexSearch(n, label);
    return { key: n.key, parentKey: n.parentKey, partId: n.partId, name: label, english: p?.english ?? '', compId: n.compId, family: p?.family ?? '', familyName: p?.familyName ?? '', quantity: n.quantity, quantityState: n.quantityState, uom: n.uom, kind: n.kind, hasChildren: this.children.has(n.key), depth, has3d: n.nodeIndex !== undefined || Boolean(p?.assets.length || p?.sceneNodes.length), conflict: p?.conflict ?? '', policy: p?.policy ?? '', markets: n.markets.join(' · '), path, nodeIndex: n.nodeIndex, unitCost: n.unitCost ?? null, sourceRef: n.sourceRef, count: 1, cb: this.marketMarks(p?.cb), mb: this.marketMarks(p?.mb), sb: this.marketMarks(p?.sb) };
  }

  private indexSearch(n: Occurrence, label: string): void {
    const p = this.parts.get(n.partId);
    this.searchText.set(n.key, [n.key, n.partId, label, p?.english, n.compId, p?.variants.join(' '), p?.familyName, n.sourceRef].join(' ').toLocaleLowerCase());
  }

  private describe(node: Occurrence): { depth: number; path: string } {
    const chain: Occurrence[] = [];
    const seen = new Set<string>();
    let current: Occurrence | undefined = node;
    while (current && !this.metadata.has(current.key)) {
      if (seen.has(current.key)) throw new Error(`循环结构：${node.key}`);
      seen.add(current.key); chain.push(current);
      current = current.parentKey ? this.nodes.get(current.parentKey) : undefined;
    }
    for (const item of chain.reverse()) {
      const parent = item.parentKey ? this.metadata.get(item.parentKey) : undefined;
      const depth = parent ? parent.depth + 1 : 0;
      const label = item.label || this.parts.get(item.partId)?.name || item.partId;
      const segments = [...(parent?.path.split(' / ') ?? []), label];
      const path = segments.length > 12 ? ['…', ...segments.slice(-11)].join(' / ') : segments.join(' / ');
      this.metadata.set(item.key, { depth, path });
    }
    return this.metadata.get(node.key)!;
  }

  private marketMarks(values: Part['cb'] | undefined): string {
    return ['EU', 'CN', 'US', 'AU'].map(m => values?.[m as keyof Part['cb']] === '✓' ? m : '').filter(Boolean).join(' · ');
  }

  private summarize(rows: BomRow[]): BomRow[] {
    const groups = new Map<string, BomRow>();
    for (const row of rows.filter(r => r.kind !== 'system')) {
      const key = JSON.stringify([row.partId, row.compId, row.uom, row.markets]);
      const previous = groups.get(key);
      if (!previous) { groups.set(key, { ...row, key: `summary:${key}`, parentKey: null, hasChildren: false, count: 1, members: [row.key] }); continue; }
      previous.count++;
      previous.members!.push(row.key);
      previous.quantity = previous.quantity === null || row.quantity === null ? null : decimalToCanonical(decimalAdd(decimalFromCanonical(previous.quantity), decimalFromCanonical(row.quantity)));
      if (previous.quantity === null) previous.quantityState = 'missing';
    }
    return [...groups.values()];
  }
}
