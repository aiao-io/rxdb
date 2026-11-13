import { Injectable, computed, signal } from '@angular/core';
import { BomIndex } from './query';
import { createDraft, DraftHistory, parseImport } from './draft';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import { DEFAULT_QUERY, type BomDataset, type BomRow, type DraftState, type Occurrence, type QuerySpec, type Structure } from './types';
@Injectable({ providedIn: 'root' })
export class BomWorkspace {
  private readonly repository = new WorkspaceRepository();
  private readonly indexes = new Map<string, BomIndex>();
  private history: DraftHistory | null = null;
  private request: AbortController | null = null;
  private saveSequence = 0;
  readonly dataset = signal<BomDataset | null>(null);
  readonly query = signal<QuerySpec>({ ...DEFAULT_QUERY });
  readonly selection = signal<string | null>(null);
  readonly selectedKeys = signal(new Set<string>());
  readonly draft = signal<DraftState | null>(null);
  readonly baseline = signal<DraftState | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly saveStatus = signal('本地工作区');
  readonly compact = signal(true);
  readonly panelOpen = signal(true);
  readonly sidebarOpen = signal(true);
  readonly expanded = signal<string[]>([]);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly index = computed(() => {
    const data = this.dataset();
    if (!data) return null;
    const structure = this.query().structure;
    const draft = this.draft();
    const cacheKey = `${data.id}:${structure}:${structure === 'draft' ? draft?.revision : ''}`;
    let index = this.indexes.get(cacheKey);
    if (!index) {
      const input = structure === 'draft' ? { ...data, structures: { ...data.structures, draft: draft?.nodes ?? [] } } : data;
      index = new BomIndex(input, structure); this.indexes.set(cacheKey, index);
    }
    return index;
  });
  readonly result = computed(() => this.index()?.query(this.query()) ?? { rows: [], roots: [], byParent: new Map<string | null, BomRow[]>(), matched: 0, total: 0, truncated: false });
  readonly selected = computed(() => {
    const key = this.selection();
    return key ? this.index()?.rows.get(key) ?? this.result().rows.find(r => r.key === key) ?? null : null;
  });
  readonly part = computed(() => this.dataset()?.parts.find(p => p.id === this.selected()?.partId) ?? null);
  readonly breadcrumbs = computed(() => {
    const scope = this.query().scope;
    const index = this.index();
    return scope && index ? [...index.ancestors(scope), index.nodes.get(scope)!].map(n => index.rows.get(n.key)!) : [];
  });
  readonly roots = computed(() => {
    const index = this.index();
    return (index?.children.get(null) ?? []).map(n => ({ ...index!.rows.get(n.key)!, children: index!.children.get(n.key)?.length ?? 0 }));
  });
  readonly stats = computed(() => {
    const parts = this.dataset()?.parts.filter(p => p.inBom) ?? [];
    return { total: parts.length, models: parts.filter(p => p.assets.length || p.sceneNodes.length).length, conflicts: parts.filter(p => p.conflict).length, missing: parts.filter(p => p.quantity === null).length };
  });

  async initialize(): Promise<void> { await this.loadWindrose(); }
  async loadWindrose(): Promise<void> {
    this.request?.abort(); this.request = new AbortController(); this.loading.set(true); this.error.set('');
    try {
      const response = await fetch('/data/windrose.json', { signal: this.request.signal });
      if (!response.ok) throw new Error(`数据读取失败：HTTP ${response.status}`);
      const data = await response.json() as BomDataset;
      if (data.schema !== 'aiao-bom-2/1') throw new Error('数据集版本不受支持');
      await this.install(data);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) this.error.set(String(error)); }
    finally { this.loading.set(false); }
  }
  async loadStress(count: number, shape: 'balanced' | 'wide' | 'deep' = 'balanced'): Promise<void> {
    this.loading.set(true);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await this.install(makeStressDataset(count, shape)); this.loading.set(false);
  }
  updateQuery(patch: Partial<QuerySpec>): void {
    this.query.update(value => ({ ...value, ...patch }));
    this.writeUrl(); void this.persistView();
  }
  changeStructure(structure: Structure): void {
    this.selection.set(null); this.selectedKeys.set(new Set()); this.expanded.set([]);
    this.updateQuery({ structure, scope: null, search: '' });
  }
  choose(row: BomRow, additive = false): void {
    this.selection.set(row.key);
    this.selectedKeys.update(keys => additive ? new Set([...keys, row.key]) : new Set([row.key]));
    this.writeUrl();
  }
  enter(key: string | null): void { this.updateQuery({ scope: key }); }
  locate(key: string): void {
    const row = this.index()?.rows.get(key);
    if (!row) return;
    this.expanded.set(this.index()!.ancestors(key).map(n => n.key));
    this.updateQuery({ scope: null, search: '', issue: 'all', only3d: false, includeCatalog: true });
    this.choose(row);
  }
  fromModel(nodeIndex: number, partId: string): void {
    const index = this.index();
    if (!index) return;
    const candidates = [...index.rows.values()].filter(r => r.nodeIndex === nodeIndex || r.partId === partId);
    const exact = candidates.find(r => r.nodeIndex === nodeIndex);
    if (exact || candidates.length === 1) { this.locate((exact ?? candidates[0]).key); return; }
    if (candidates.length > 1) this.notice.set(`该物料有 ${candidates.length} 个使用位置，已切换 CAD 结构定位具体模型节点。`);
    this.changeStructure('cad'); this.locate(`cad:${nodeIndex}`);
  }
  fork(): void {
    const index = this.index(); const data = this.dataset();
    if (!index || !data) return;
    const result = index.query({ ...this.query(), mode: 'tree' });
    const keys = new Set(result.rows.map(r => r.key));
    const nodes = result.rows.map(r => ({ ...index.nodes.get(r.key)!, parentKey: r.parentKey && keys.has(r.parentKey) ? r.parentKey : null }));
    const draft = createDraft(data, nodes);
    this.setDraft(draft); this.changeStructure('draft'); this.notice.set(`已建立 ${nodes.length.toLocaleString()} 个发生位置的草稿，来源快照已保留。`);
  }
  importDraft(text: string): { nodes: number; name: string; draft: DraftState } {
    const draft = parseImport(text);
    return { nodes: draft.nodes.length, name: draft.name, draft };
  }
  acceptImport(draft: DraftState): void {
    const data = this.dataset();
    if (!data) throw new Error('数据集尚未加载');
    this.setDraft({ ...draft, datasetId: data.id }); this.changeStructure('draft');
  }
  edit(keys: string[], quantity: string, uom: string, unitCost: string | null): void {
    if (!this.history) throw new Error('请先建立草稿');
    this.history.patch(keys, { quantity, uom, unitCost, quantityState: 'confirmed' }); this.publishDraft();
  }
  add(parentKey: string | null, partId: string, quantity: string, uom: string): void {
    if (!this.history) throw new Error('请先建立草稿');
    this.history.add(parentKey, partId, quantity, uom); this.publishDraft();
  }
  remove(keys: string[]): void { this.history?.remove(keys); this.publishDraft(); this.selection.set(null); this.selectedKeys.set(new Set()); }
  move(key: string, parentKey: string | null): void { this.history?.move(key, parentKey); this.publishDraft(); }
  undo(): void { this.history?.undo(); this.publishDraft(); }
  redo(): void { this.history?.redo(); this.publishDraft(); }
  saveBaseline(): void { const draft = this.draft(); if (draft) { this.baseline.set(structuredClone(draft)); this.notice.set('已保存当前草稿作为比较基线。'); void this.repository.write(`baseline:${draft.datasetId}`, draft).catch(e => this.notice.set(`基线保存失败：${String(e)}`)); } }

  private async install(data: BomDataset): Promise<void> {
    this.indexes.clear(); this.dataset.set(data); this.selection.set(null); this.selectedKeys.set(new Set());
    this.query.set({ ...DEFAULT_QUERY }); this.expanded.set([]); this.draft.set(null); this.history = null;
    try {
      const [saved, view, baseline] = await Promise.all([this.repository.read<DraftState>(`draft:${data.id}`), this.repository.read<Partial<QuerySpec>>(`view:${data.id}`), this.repository.read<DraftState>(`baseline:${data.id}`)]);
      if (saved) this.setDraft(parseImport(JSON.stringify(saved)), false);
      this.baseline.set(baseline ?? null);
      if (view) this.query.set({ ...DEFAULT_QUERY, ...view, scope: null });
      this.readUrl(); this.saveStatus.set('已保存到本机');
    } catch (error) { this.notice.set(`本地工作区读取失败：${String(error)}`); }
    const first = this.result().rows.find(r => r.kind !== 'system');
    if (!this.selection() && first) this.choose(first);
  }
  private setDraft(draft: DraftState, persist = true): void {
    this.history = new DraftHistory(draft); this.draft.set(draft);
    if (persist) this.publishDraft();
  }
  private publishDraft(): void {
    if (!this.history) return;
    for (const key of this.indexes.keys()) if (key.includes(':draft:')) this.indexes.delete(key);
    this.draft.set(this.history.current); this.canUndo.set(this.history.canUndo); this.canRedo.set(this.history.canRedo);
    const sequence = ++this.saveSequence;
    this.saveStatus.set('正在保存…');
    void this.repository.write(`draft:${this.history.current.datasetId}`, this.history.current).then(() => { if (sequence === this.saveSequence) this.saveStatus.set('已保存到本机'); }).catch(error => this.notice.set(`草稿保存失败：${String(error)}`));
  }
  private async persistView(): Promise<void> {
    const data = this.dataset();
    if (!data) return;
    try { await this.repository.write(`view:${data.id}`, this.query()); } catch (error) { this.notice.set(`视图保存失败：${String(error)}`); }
  }
  private writeUrl(): void {
    const q = this.query(); const url = new URL(location.href);
    for (const [key, value] of Object.entries({ structure: q.structure, view: q.mode, scope: q.scope, q: q.search, market: q.market, pn: this.selected()?.compId })) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }
  private readUrl(): void {
    const params = new URLSearchParams(location.search); const structure = params.get('structure'); const mode = params.get('view');
    const patch: Partial<QuerySpec> = { search: params.get('q') ?? '' };
    if (structure && ['catalog', 'purchase', 'cad', 'draft'].includes(structure) && (structure !== 'draft' || this.draft())) patch.structure = structure as Structure;
    if (mode && ['tree', 'flat', 'summary'].includes(mode)) patch.mode = mode as QuerySpec['mode'];
    if (['EU', 'CN', 'US', 'AU'].includes(params.get('market') ?? '')) patch.market = params.get('market') as QuerySpec['market'];
    this.query.update(q => ({ ...q, ...patch }));
    const scope = params.get('scope'); if (scope && this.index()?.nodes.has(scope)) this.query.update(q => ({ ...q, scope }));
    const pn = params.get('pn'); const row = pn ? [...(this.index()?.rows.values() ?? [])].find(r => r.compId === pn || r.partId === pn) : null;
    if (row) { this.selection.set(row.key); this.selectedKeys.set(new Set([row.key])); this.expanded.set(this.index()!.ancestors(row.key).map(n => n.key)); }
  }
}
