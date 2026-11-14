import { Injectable, computed, signal } from '@angular/core';
import { BomIndex } from './query';
import { createDraft, DraftHistory, parseImport } from './draft';
import { IndexClient } from './index-client';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import { createSnapshot } from './snapshot';
import { SnapshotWorkspace } from './snapshot-workspace';
import { DEFAULT_QUERY, type BomDataset, type BomRow, type DraftState, type QuerySpec, type Structure } from './types';
@Injectable({ providedIn: 'root' })
export class BomWorkspace {
  private readonly worker = new IndexClient();
  private readonly repository = new WorkspaceRepository();
  private readonly indexes = new Map<string, BomIndex>();
  private history: DraftHistory | null = null;
  private request: AbortController | null = null;
  private saveSequence = 0;
  private loadSequence = 0;
  readonly dataset = signal<BomDataset | null>(null);
  readonly query = signal<QuerySpec>({ ...DEFAULT_QUERY });
  readonly selection = signal<string | null>(null);
  readonly selectedKeys = signal(new Set<string>());
  readonly draft = signal<DraftState | null>(null);
  readonly baseline = signal<DraftState | null>(null);
  readonly versions = new SnapshotWorkspace(this.repository);
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
    const sequence = this.beginLoad();
    try {
      const response = await fetch('/data/windrose.json', { signal: this.request!.signal });
      if (!response.ok) throw new Error(`数据读取失败：HTTP ${response.status}`);
      const data = await response.json() as BomDataset;
      if (data.schema !== 'aiao-bom-2/1') throw new Error('数据集版本不受支持');
      if (sequence === this.loadSequence) await this.install(data, sequence);
    } catch (error) {
      if (sequence === this.loadSequence && !(error instanceof DOMException && error.name === 'AbortError')) this.error.set(String(error));
    } finally { if (sequence === this.loadSequence) this.loading.set(false); }
  }
  async loadStress(count: number, shape: 'balanced' | 'wide' | 'deep' = 'balanced'): Promise<void> {
    const sequence = this.beginLoad();
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (sequence !== this.loadSequence) return;
      const prepared = typeof Worker === 'undefined' ? { dataset: makeStressDataset(count, shape), rows: undefined } : await this.worker.build(count, shape);
      if (sequence === this.loadSequence) await this.install(prepared.dataset, sequence, prepared.rows, true);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) throw error; }
    finally { if (sequence === this.loadSequence) this.loading.set(false); }
  }
  cancelLoad(): void {
    this.worker.cancel(); this.request?.abort(); this.loadSequence++; this.loading.set(false); this.notice.set('数据装载已取消，保留当前工作区');
  }
  updateQuery(patch: Partial<QuerySpec>): void {
    performance.mark('bom2:interaction-start');
    this.query.update(value => ({ ...value, ...patch }));
    if (this.query().search && this.query().mode === 'tree') this.expanded.set(this.result().rows.filter(row => row.hasChildren).map(row => row.key));
    this.writeUrl(); void this.persistView();
  }
  setExpanded(keys: string[]): void { this.expanded.set(keys); void this.persistView(); }
  changeStructure(structure: Structure): void {
    this.selection.set(null); this.selectedKeys.set(new Set()); this.expanded.set([]);
    this.updateQuery({ structure, scope: null, search: '' });
  }
  choose(row: BomRow, additive = false): void {
    this.selection.set(row.key);
    this.selectedKeys.update(keys => additive ? new Set([...keys, ...(row.members ?? [row.key])]) : new Set(row.members ?? [row.key]));
    this.writeUrl();
  }
  enter(key: string | null): void {
    if (key) { this.expanded.update(keys => [...new Set([...keys, key])]); const row = this.index()?.rows.get(key); if (row) this.choose(row); }
    this.updateQuery({ scope: key });
  }
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
  async saveSnapshot(name: string, evaluationDate: string): Promise<void> {
    const data = this.dataset();
    if (!data) throw new Error('数据集尚未加载');
    const structure = this.query().structure;
    const nodes = structure === 'draft' ? this.draft()?.nodes ?? [] : [...(this.index()?.nodes.values() ?? [])];
    const snapshot = createSnapshot({
      id: crypto.randomUUID(), datasetId: data.id, name,
      source: structure === 'draft' ? 'draft' : 'dataset', structure,
      version: structure === 'draft' ? `r${this.draft()?.revision}` : data.version,
      evaluationDate, observedOn: data.observedOn, savedAt: new Date().toISOString(), nodes
    });
    await this.versions.save(snapshot);
    if (this.dataset() === data) this.notice.set(`已保存版本快照：${snapshot.name} · ${snapshot.evaluationDate} · ${nodes.length.toLocaleString()} 个位置`);
  }

  private async install(data: BomDataset, sequence: number, prepared?: BomRow[], resetUrl = false): Promise<void> {
    performance.clearMeasures('bom2:first-interactive'); performance.clearMarks('bom2:data-ready'); performance.mark('bom2:data-ready');
    let saved: DraftState | undefined;
    let baseline: DraftState | undefined;
    let view: (Partial<QuerySpec> & { expanded?: string[] }) | undefined;
    try { [saved, view, baseline] = await Promise.all([this.repository.read<DraftState>(`draft:${data.id}`), this.repository.read<Partial<QuerySpec> & { expanded?: string[] }>(`view:${data.id}`), this.repository.read<DraftState>(`baseline:${data.id}`)]); }
    catch (error) { if (sequence === this.loadSequence) this.notice.set(`本地工作区读取失败：${String(error)}`); }
    if (sequence !== this.loadSequence) return;
    if (resetUrl) history.replaceState(null, '', location.pathname);
    this.indexes.clear();
    if (prepared) this.indexes.set(`${data.id}:catalog:`, new BomIndex(data, 'catalog', prepared));
    this.dataset.set(data); this.selection.set(null); this.selectedKeys.set(new Set());
    this.query.set({ ...DEFAULT_QUERY }); this.expanded.set([]); this.draft.set(null); this.baseline.set(null); this.history = null; this.canUndo.set(false); this.canRedo.set(false);
    try {
      if (saved) this.setDraft(parseImport(JSON.stringify(saved)), false);
      this.baseline.set(baseline ? parseImport(JSON.stringify(baseline)) : null);
      if (view) { this.query.set(this.sanitizeQuery(view)); if (Array.isArray(view.expanded)) this.expanded.set(view.expanded.filter(key => this.index()?.nodes.has(key))); }
      this.readUrl(); this.saveStatus.set('已保存到本机');
    } catch (error) { this.notice.set(`本地工作区读取失败：${String(error)}`); }
    if (sequence !== this.loadSequence) return;
    if (!this.expanded().length) this.expanded.set((this.index()?.children.get(null) ?? []).map(n => n.key));
    const first = this.result().rows.find(r => r.kind !== 'system');
    if (!this.selection() && first) this.choose(first);
    await this.versions.openDataset(data.id);
  }
  private setDraft(draft: DraftState, persist = true): void {
    this.history = new DraftHistory(draft); this.draft.set(draft); this.canUndo.set(false); this.canRedo.set(false);
    if (persist) this.publishDraft();
  }
  private publishDraft(): void {
    if (!this.history) return;
    for (const key of this.indexes.keys()) if (key.includes(':draft:')) this.indexes.delete(key);
    this.draft.set(this.history.current); this.canUndo.set(this.history.canUndo); this.canRedo.set(this.history.canRedo);
    const sequence = ++this.saveSequence;
    this.saveStatus.set('正在保存…');
    void this.repository.write(`draft:${this.history.current.datasetId}`, this.history.current).then(() => { if (sequence === this.saveSequence) this.saveStatus.set('已保存到本机'); }).catch(error => { if (sequence === this.saveSequence) { this.saveStatus.set('保存失败'); this.notice.set(`草稿保存失败：${String(error)}`); } });
  }
  private async persistView(): Promise<void> {
    const data = this.dataset();
    if (!data) return;
    try { await this.repository.write(`view:${data.id}`, { ...this.query(), expanded: this.expanded() }); } catch (error) { this.notice.set(`视图保存失败：${String(error)}`); }
  }
  private beginLoad(): number {
    this.worker.cancel(); this.request?.abort(); this.request = new AbortController(); this.loading.set(true); this.error.set('');
    this.saveSequence++;
    return ++this.loadSequence;
  }
  private sanitizeQuery(view: Partial<QuerySpec>): QuerySpec {
    const result = { ...DEFAULT_QUERY };
    if (['catalog', 'purchase', 'cad', 'draft'].includes(String(view.structure)) && (view.structure === 'draft' ? this.draft() : this.dataset()?.structures[view.structure as Structure].length)) result.structure = view.structure!;
    if (['tree', 'flat', 'summary'].includes(String(view.mode))) result.mode = view.mode!;
    if (['', 'EU', 'CN', 'US', 'AU'].includes(String(view.market))) result.market = view.market!;
    if (['all', 'conflict', 'quantity', 'unmapped'].includes(String(view.issue))) result.issue = view.issue!;
    if (['source', 'name', 'partId', 'quantity'].includes(String(view.sort))) result.sort = view.sort!;
    if (typeof view.search === 'string') result.search = view.search.slice(0, 500);
    for (const key of ['only3d', 'includeCatalog', 'descending'] as const) if (typeof view[key] === 'boolean') result[key] = view[key]!;
    return result;
  }
  private writeUrl(): void {
    const q = this.query(); const url = new URL(location.href);
    for (const [key, value] of Object.entries({ structure: q.structure, view: q.mode, scope: q.scope, q: q.search, market: q.market, pn: this.selected()?.compId, occurrence: this.selection() })) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }
  private readUrl(): void {
    const params = new URLSearchParams(location.search); const structure = params.get('structure'); const mode = params.get('view');
    const patch: Partial<QuerySpec> = { search: params.get('q') ?? '' };
    if (structure && ['catalog', 'purchase', 'cad', 'draft'].includes(structure) && (structure === 'draft' ? Boolean(this.draft()) : Boolean(this.dataset()?.structures[structure as Structure].length))) patch.structure = structure as Structure;
    if (mode && ['tree', 'flat', 'summary'].includes(mode)) patch.mode = mode as QuerySpec['mode'];
    if (['EU', 'CN', 'US', 'AU'].includes(params.get('market') ?? '')) patch.market = params.get('market') as QuerySpec['market'];
    this.query.update(q => ({ ...q, ...patch }));
    const scope = params.get('scope'); if (scope && this.index()?.nodes.has(scope)) this.query.update(q => ({ ...q, scope }));
    const occurrence = params.get('occurrence');
    const pn = params.get('pn'); const row = (occurrence ? this.index()?.rows.get(occurrence) : null) ?? (pn ? [...(this.index()?.rows.values() ?? [])].find(r => r.compId === pn || r.partId === pn) : null);
    if (row) { this.selection.set(row.key); this.selectedKeys.set(new Set([row.key])); this.expanded.set(this.index()!.ancestors(row.key).map(n => n.key)); }
  }
}
