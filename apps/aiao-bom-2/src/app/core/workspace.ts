import { computed, Injectable, signal } from '@angular/core';
import { compareDraftsDetailed, createDraft, DraftHistory, parseImport } from './draft';
import { DraftVersionStore } from './draft-version-store';
import { commitBranch, createDraftBranch, createDraftCommit, markBranchDirty } from './draft-worktree';
import { IndexClient } from './index-client';
import { BomIndex } from './query';
import { createSnapshot } from './snapshot';
import { SnapshotWorkspace } from './snapshot-workspace';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import {
  DEFAULT_QUERY,
  type BomDataset,
  type BomRow,
  type DraftBranch,
  type DraftCommit,
  type DraftState,
  type QuerySpec,
  type Structure
} from './types';
@Injectable({ providedIn: 'root' })
export class BomWorkspace {
  private readonly worker = new IndexClient();
  private readonly repository = new WorkspaceRepository();
  private readonly versionStore = new DraftVersionStore();
  private pendingSave: Promise<void> = Promise.resolve();
  private readonly indexes = new Map<string, BomIndex>();
  private readonly branchBaselines = new Map<string, DraftState>();
  private previousDiffExpanded: string[] = [];
  private diffIndex: { key: string; index: BomIndex } | null = null;
  private history: DraftHistory | null = null;
  private request: AbortController | null = null;
  private saveSequence = 0;
  private loadSequence = 0;
  readonly dataset = signal<BomDataset | null>(null);
  readonly query = signal<QuerySpec>({ ...DEFAULT_QUERY });
  readonly selection = signal<string | null>(null);
  readonly selectedKeys = signal(new Set<string>());
  readonly draft = signal<DraftState | null>(null);
  readonly versionBusy = signal(false);
  readonly branches = signal<DraftBranch[]>([]);
  readonly commits = signal<DraftCommit[]>([]);
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
  readonly diffMode = signal(false);
  readonly activeBranch = computed(() => {
    const draft = this.draft();
    return (
      this.branches().find(branch => branch.id === this.activeBranchId()) ?? (draft ? this.branches()[0] : undefined)
    );
  });
  readonly activeBranchId = signal<string | null>(null);
  readonly index = computed(() => {
    const data = this.dataset();
    if (!data) return null;
    const structure = this.query().structure;
    const draft = this.draft();
    const cacheKey = `${data.id}:${structure}:${structure === 'draft' ? `${this.activeBranchId()}:${draft?.revision}` : ''}`;
    let index = this.indexes.get(cacheKey);
    if (!index) {
      const input =
        structure === 'draft' ? { ...data, structures: { ...data.structures, draft: draft?.nodes ?? [] } } : data;
      index = new BomIndex(input, structure);
      this.indexes.set(cacheKey, index);
    }
    return index;
  });
  readonly diffBase = computed(() => {
    const branch = this.activeBranch();
    if (branch?.headCommitId) return this.commits().find(commit => commit.id === branch.headCommitId)?.draft ?? null;
    return this.baseline();
  });
  readonly diffChanges = computed(() => {
    const before = this.diffBase();
    const after = this.draft();
    return before && after ? compareDraftsDetailed(before, after) : [];
  });
  readonly diffSummary = computed(() => ({
    added: this.diffChanges().filter(change => change.kind === 'added').length,
    removed: this.diffChanges().filter(change => change.kind === 'removed').length,
    changed: this.diffChanges().filter(change => change.kind === 'changed').length
  }));
  readonly result = computed(() => {
    const result = this.index()?.query(this.query()) ?? {
      rows: [],
      roots: [],
      byParent: new Map<string | null, BomRow[]>(),
      matched: 0,
      total: 0,
      truncated: false
    };
    return this.diffMode() && this.query().structure === 'draft' ? this.withDiff(result) : result;
  });
  readonly selected = computed(() => {
    const key = this.selection();
    return key ? (this.index()?.rows.get(key) ?? this.result().rows.find(r => r.key === key) ?? null) : null;
  });
  readonly part = computed(() => this.dataset()?.parts.find(p => p.id === this.selected()?.partId) ?? null);
  readonly breadcrumbs = computed(() => {
    const scope = this.query().scope;
    const index = this.index();
    return scope && index ? [...index.ancestors(scope), index.nodes.get(scope)!].map(n => index.rows.get(n.key)!) : [];
  });
  readonly roots = computed(() => {
    const index = this.index();
    return (index?.children.get(null) ?? []).map(n => ({
      ...index!.rows.get(n.key)!,
      children: index!.children.get(n.key)?.length ?? 0
    }));
  });
  readonly stats = computed(() => {
    const parts = this.dataset()?.parts.filter(p => p.inBom) ?? [];
    return {
      total: parts.length,
      models: parts.filter(p => p.assets.length || p.sceneNodes.length).length,
      conflicts: parts.filter(p => p.conflict).length,
      missing: parts.filter(p => p.quantity === null).length
    };
  });

  async initialize(): Promise<void> {
    await this.loadWindrose();
  }
  async loadWindrose(): Promise<void> {
    const sequence = this.beginLoad();
    try {
      const response = await fetch('/data/windrose.json', { signal: this.request!.signal });
      if (!response.ok) throw new Error(`数据读取失败：HTTP ${response.status}`);
      const data = (await response.json()) as BomDataset;
      if (data.schema !== 'aiao-bom-2/1') throw new Error('数据集版本不受支持');
      if (sequence === this.loadSequence) await this.install(data, sequence);
    } catch (error) {
      if (sequence === this.loadSequence && !(error instanceof DOMException && error.name === 'AbortError'))
        this.error.set(String(error));
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
  async loadStress(count: number, shape: 'balanced' | 'wide' | 'deep' = 'balanced'): Promise<void> {
    const sequence = this.beginLoad();
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (sequence !== this.loadSequence) return;
      const prepared =
        typeof Worker === 'undefined' ?
          { dataset: makeStressDataset(count, shape), rows: undefined }
        : await this.worker.build(count, shape);
      if (sequence === this.loadSequence) await this.install(prepared.dataset, sequence, prepared.rows, true);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
  cancelLoad(): void {
    this.worker.cancel();
    this.request?.abort();
    this.loadSequence++;
    this.loading.set(false);
    this.notice.set('数据装载已取消，保留当前工作区');
  }
  updateQuery(patch: Partial<QuerySpec>): void {
    performance.mark('bom2:interaction-start');
    this.query.update(value => ({ ...value, ...patch }));
    if (this.query().search && this.query().mode === 'tree')
      this.expanded.set(
        this.result()
          .rows.filter(row => row.hasChildren)
          .map(row => row.key)
      );
    this.writeUrl();
    void this.persistView();
  }
  setExpanded(keys: string[]): void {
    this.expanded.set(keys);
    void this.persistView();
  }
  changeStructure(structure: Structure): void {
    if (structure !== 'draft') this.diffMode.set(false);
    this.selection.set(null);
    this.selectedKeys.set(new Set());
    this.expanded.set([]);
    this.updateQuery({ structure, scope: null, search: '' });
  }
  choose(row: BomRow, additive = false): void {
    this.selection.set(row.key);
    this.selectedKeys.update(keys =>
      additive ? new Set([...keys, ...(row.members ?? [row.key])]) : new Set(row.members ?? [row.key])
    );
    this.writeUrl();
  }
  enter(key: string | null): void {
    if (key && !this.index()?.nodes.has(key)) return;
    if (key) {
      this.expanded.update(keys => [...new Set([...keys, key])]);
      const row = this.index()?.rows.get(key);
      if (row) this.choose(row);
    }
    this.updateQuery({ scope: key });
  }
  locate(key: string): void {
    const row = this.index()?.rows.get(key);
    if (!row) return;
    this.expanded.set(
      this.index()!
        .ancestors(key)
        .map(n => n.key)
    );
    this.updateQuery({ scope: null, search: '', issue: 'all', only3d: false, includeCatalog: true });
    this.choose(row);
  }
  fromModel(nodeIndex: number, partId: string): void {
    const index = this.index();
    if (!index) return;
    const candidates = [...index.rows.values()].filter(r => r.nodeIndex === nodeIndex || r.partId === partId);
    const exact = candidates.find(r => r.nodeIndex === nodeIndex);
    if (exact || candidates.length === 1) {
      this.locate((exact ?? candidates[0]).key);
      return;
    }
    if (candidates.length > 1)
      this.notice.set(`该物料有 ${candidates.length} 个使用位置，已切换 CAD 结构定位具体模型节点。`);
    this.changeStructure('cad');
    this.locate(`cad:${nodeIndex}`);
  }
  fork(name = ''): void {
    if (this.versionBusy()) return;
    const index = this.index();
    const data = this.dataset();
    if (!index || !data) return;
    const result = index.query({ ...this.query(), mode: 'tree' });
    const keys = new Set(result.rows.map(r => r.key));
    const nodes = result.rows.map(r => ({
      ...index.nodes.get(r.key)!,
      parentKey: r.parentKey && keys.has(r.parentKey) ? r.parentKey : null
    }));
    const draft = createDraft(data, nodes);
    const branch = createDraftBranch(data, draft, name);
    this.branches.update(branches => [
      ...branches.map(item => (item.datasetId === data.id ? { ...item, active: false } : item)),
      branch
    ]);
    this.activeBranchId.set(branch.id);
    this.baseline.set(structuredClone(draft));
    this.branchBaselines.set(branch.id, this.baseline()!);
    void this.repository.writeMany([
      [`baseline:${data.id}`, draft],
      [`baseline:${data.id}:${branch.id}`, draft]
    ]);
    this.setDraft(draft);
    this.changeStructure('draft');
    this.notice.set(`已建立 ${nodes.length.toLocaleString()} 个发生位置的草稿，来源快照已保留。`);
  }
  async commitDraft(message: string): Promise<void> {
    if (this.versionBusy()) throw new Error('版本操作正在进行');
    const draft = this.draft();
    const branch = this.activeBranch();
    if (!draft || !branch) throw new Error('请先建立工作分支');
    if (!branch.dirty) throw new Error('没有未提交的改动');
    const proposal = createDraftCommit(branch, draft, message);
    this.versionBusy.set(true);
    try {
      await this.pendingSave;
      const stored = await this.versionStore.commit(branch, proposal.message, proposal.id);
      const snapshot = await this.saveSnapshot(
        `${branch.name} · ${proposal.message}`,
        new Date().toISOString().slice(0, 10),
        'draft'
      );
      const committed = { ...proposal, ...stored, snapshotId: snapshot.id };
      const nextBranch = commitBranch(branch, committed);
      await this.repository.writeMany([
        [`draft-commit:${draft.datasetId}:${branch.id}:${committed.id}`, committed],
        [`draft-branch:${draft.datasetId}:${branch.id}`, nextBranch]
      ]);
      this.branches.update(branches => branches.map(item => (item.id === branch.id ? nextBranch : item)));
      this.commits.update(commits => [committed, ...commits]);
      this.saveStatus.set('已提交到本地版本历史');
      this.notice.set(`已提交 ${branch.name}：${committed.message}`);
    } finally {
      this.versionBusy.set(false);
    }
  }
  async switchDraftBranch(branchId: string): Promise<void> {
    const branch = this.branches().find(item => item.id === branchId);
    if (!branch || branch.id === this.activeBranchId() || this.versionBusy()) return;
    this.versionBusy.set(true);
    try {
      await this.pendingSave;
      const saved = await this.repository.read<DraftState>(`draft:${branch.datasetId}:${branch.id}`);
      if (!saved) throw new Error(`分支没有可恢复的工作树：${branch.name}`);
      const baseline =
        this.branchBaselines.get(branch.id) ??
        (await this.repository.read<DraftState>(`baseline:${branch.datasetId}:${branch.id}`));
      const next = await this.versionStore.read(branch, saved);
      await this.refreshDraftHistory(branch);
      const activeBranches = this.branches().map(item => ({ ...item, active: item.id === branch.id }));
      await this.repository.writeMany([
        [`draft:${branch.datasetId}`, next],
        ...activeBranches.map(item => [`draft-branch:${branch.datasetId}:${item.id}`, item] as const)
      ]);
      this.activeBranchId.set(branch.id);
      this.branches.set(activeBranches);
      this.setDraft(next, false);
      this.baseline.set(baseline ? parseImport(JSON.stringify(baseline)) : null);
      this.reconcileBranchDirty();
      this.changeStructure('draft');
      this.saveStatus.set(this.activeBranch()?.dirty ? '已保存到本机' : '已提交到本地版本历史');
      this.notice.set(`已切换到 ${branch.name}`);
    } catch (error) {
      this.notice.set(`分支切换失败：${String(error)}`);
    } finally {
      this.versionBusy.set(false);
    }
  }
  async restoreCommit(commitId: string): Promise<void> {
    const branch = this.activeBranch();
    const history = this.history;
    if (!branch || !history || this.versionBusy()) throw new Error('请先选择工作分支');
    if (branch.dirty) throw new Error('请先提交当前改动，再恢复历史版本');
    this.versionBusy.set(true);
    try {
      await this.pendingSave;
      const restored = await this.versionStore.restore(branch, commitId);
      history.restore(restored.nodes);
      this.publishDraft();
      await this.pendingSave;
      this.changeStructure('draft');
      this.notice.set('历史版本已恢复到工作树，请核对后提交。');
    } finally {
      this.versionBusy.set(false);
    }
  }
  edit(keys: string[], quantity: string, uom: string, unitCost: string | null): void {
    if (this.versionBusy()) return;
    if (!this.history) throw new Error('请先建立草稿');
    this.history.patch(keys, { quantity, uom, unitCost, quantityState: 'confirmed' });
    this.publishDraft();
  }
  editCell(key: string, field: 'quantityText' | 'uom' | 'unitCost', value: string): void {
    if (this.versionBusy()) return;
    if (!this.history) throw new Error('请先建立草稿');
    const node = this.history.current.nodes.find(node => node.key === key);
    if (!node) throw new Error('发生位置不存在');
    const next = value.trim() === '—' ? '' : value.trim();
    const stored = field === 'quantityText' ? node.quantity : node[field];
    if (
      (stored ?? '') === next &&
      (field !== 'quantityText' || node.quantityState === (next ? 'confirmed' : 'missing'))
    )
      return;
    if (field === 'quantityText')
      this.history.patch([key], { quantity: next || null, quantityState: next ? 'confirmed' : 'missing' });
    else if (field === 'unitCost') this.history.patch([key], { unitCost: next || null });
    else this.history.patch([key], { uom: next });
    this.publishDraft();
  }
  toggleDiffMode(): void {
    if (this.query().structure !== 'draft') return;
    const enabled = !this.diffMode();
    if (enabled) this.previousDiffExpanded = this.expanded();
    this.diffMode.set(enabled);
    this.expanded.set(
      enabled ?
        this.result()
          .rows.filter(row => row.hasChildren)
          .map(row => row.key)
      : this.previousDiffExpanded
    );
  }
  add(parentKey: string | null, partId: string, quantity: string, uom: string): void {
    if (this.versionBusy()) return;
    if (!this.history) throw new Error('请先建立草稿');
    this.history.add(parentKey, partId, quantity, uom);
    this.publishDraft();
  }
  remove(keys: string[]): void {
    if (this.versionBusy()) return;
    this.history?.remove(keys);
    this.publishDraft();
    this.selection.set(null);
    this.selectedKeys.set(new Set());
  }
  move(key: string, parentKey: string | null): void {
    if (this.versionBusy()) return;
    this.history?.move(key, parentKey);
    this.publishDraft();
  }
  undo(): void {
    if (this.versionBusy()) return;
    this.history?.undo();
    this.publishDraft();
  }
  redo(): void {
    if (this.versionBusy()) return;
    this.history?.redo();
    this.publishDraft();
  }
  saveBaseline(): void {
    const draft = this.draft();
    if (draft) {
      this.baseline.set(structuredClone(draft));
      const branch = this.activeBranch();
      if (branch) this.branchBaselines.set(branch.id, this.baseline()!);
      this.diffIndex = null;
      this.notice.set('已保存当前草稿作为比较基线。');
      void this.repository
        .writeMany([
          [`baseline:${draft.datasetId}`, draft],
          ...(branch ? [[`baseline:${draft.datasetId}:${branch.id}`, draft] as const] : [])
        ])
        .catch(e => this.notice.set(`基线保存失败：${String(e)}`));
    }
  }
  async saveSnapshot(
    name: string,
    evaluationDate: string,
    structure = this.query().structure
  ): Promise<import('./snapshot').BomSnapshot> {
    const data = this.dataset();
    if (!data) throw new Error('数据集尚未加载');
    const nodes = structure === 'draft' ? (this.draft()?.nodes ?? []) : [...(this.index()?.nodes.values() ?? [])];
    const snapshot = createSnapshot({
      id: crypto.randomUUID(),
      datasetId: data.id,
      name,
      source: structure === 'draft' ? 'draft' : 'dataset',
      structure,
      version: structure === 'draft' ? `r${this.draft()?.revision}` : data.version,
      evaluationDate,
      observedOn: data.observedOn,
      savedAt: new Date().toISOString(),
      nodes
    });
    await this.versions.save(snapshot);
    if (this.dataset() === data)
      this.notice.set(
        `已保存版本快照：${snapshot.name} · ${snapshot.evaluationDate} · ${nodes.length.toLocaleString()} 个位置`
      );
    return snapshot;
  }

  private async install(data: BomDataset, sequence: number, prepared?: BomRow[], resetUrl = false): Promise<void> {
    performance.clearMeasures('bom2:first-interactive');
    performance.clearMarks('bom2:data-ready');
    performance.mark('bom2:data-ready');
    let saved: DraftState | undefined;
    let savedBranches: DraftBranch[] = [];
    let savedCommits: DraftCommit[] = [];
    let baseline: DraftState | undefined;
    let restoredDraft: DraftState | undefined;
    let view: (Partial<QuerySpec> & { expanded?: string[] }) | undefined;
    try {
      [saved, view, baseline, savedBranches, savedCommits] = await Promise.all([
        this.repository.read<DraftState>(`draft:${data.id}`),
        this.repository.read<Partial<QuerySpec> & { expanded?: string[] }>(`view:${data.id}`),
        this.repository.read<DraftState>(`baseline:${data.id}`),
        this.repository.readAll<DraftBranch>(`draft-branch:${data.id}:`),
        this.repository.readAll<DraftCommit>(`draft-commit:${data.id}:`)
      ]);
    } catch (error) {
      if (sequence === this.loadSequence) this.notice.set(`本地工作区读取失败：${String(error)}`);
    }
    if (sequence !== this.loadSequence) return;
    if (resetUrl) history.replaceState(null, '', location.pathname);
    this.indexes.clear();
    this.branchBaselines.clear();
    this.diffIndex = null;
    if (prepared) this.indexes.set(`${data.id}:catalog:`, new BomIndex(data, 'catalog', prepared));
    this.dataset.set(data);
    this.selection.set(null);
    this.selectedKeys.set(new Set());
    this.query.set({ ...DEFAULT_QUERY });
    this.expanded.set([]);
    this.draft.set(null);
    this.branches.set(savedBranches.filter(branch => branch.datasetId === data.id));
    this.commits.set(
      savedCommits.filter(commit => commit.datasetId === data.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
    this.activeBranchId.set(
      this.branches().find(branch => branch.active)?.id ??
        [...this.branches()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id ??
        null
    );
    this.branches.update(branches =>
      branches.map(branch => ({ ...branch, active: branch.id === this.activeBranchId() }))
    );
    this.baseline.set(null);
    this.history = null;
    this.canUndo.set(false);
    this.canRedo.set(false);
    try {
      if (saved) {
        if (!this.branches().length) {
          const legacyBranch = createDraftBranch(data, saved, 'main');
          this.branches.set([legacyBranch]);
          this.activeBranchId.set(legacyBranch.id);
        }
        const branch = this.activeBranch();
        if (branch) baseline = (await this.repository.read<DraftState>(`baseline:${data.id}:${branch.id}`)) ?? baseline;
        const restored = branch ? await this.versionStore.read(branch, saved) : saved;
        if (branch) await this.refreshDraftHistory(branch);
        if (sequence !== this.loadSequence) return;
        restoredDraft = parseImport(JSON.stringify(restored));
        this.setDraft(restoredDraft, false);
      }
      const initialBaseline =
        baseline ?? (restoredDraft && !this.activeBranch()?.headCommitId ? structuredClone(restoredDraft) : undefined);
      this.baseline.set(initialBaseline ? parseImport(JSON.stringify(initialBaseline)) : null);
      const branch = this.activeBranch();
      if (branch && this.baseline()) this.branchBaselines.set(branch.id, this.baseline()!);
      this.reconcileBranchDirty();
      if (!baseline && initialBaseline) void this.repository.write(`baseline:${data.id}`, initialBaseline);
      if (view) {
        this.query.set(this.sanitizeQuery(view));
        if (Array.isArray(view.expanded)) this.expanded.set(view.expanded.filter(key => this.index()?.nodes.has(key)));
      }
      this.readUrl();
      this.saveStatus.set('已保存到本机');
    } catch (error) {
      this.notice.set(`本地工作区读取失败：${String(error)}`);
    }
    if (sequence !== this.loadSequence) return;
    if (!this.expanded().length) this.expanded.set((this.index()?.children.get(null) ?? []).map(n => n.key));
    const first = this.result().rows.find(r => r.kind !== 'system');
    if (!this.selection() && first) this.choose(first);
    await this.versions.openDataset(data.id);
  }
  private setDraft(draft: DraftState, persist = true): void {
    this.clearDraftIndexes();
    this.history = new DraftHistory(draft);
    this.draft.set(draft);
    this.canUndo.set(false);
    this.canRedo.set(false);
    if (persist) this.publishDraft();
  }
  private publishDraft(): void {
    if (!this.history) return;
    this.clearDraftIndexes();
    const draft = this.history.current;
    this.draft.set(draft);
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
    const branch = this.activeBranch();
    const sequence = ++this.saveSequence;
    this.saveStatus.set('正在保存…');
    const dirty =
      branch ? { ...markBranchDirty(branch), dirty: !branch.headCommitId || this.diffChanges().length > 0 } : undefined;
    const branches = this.branches().map(item => (item.id === dirty?.id ? dirty : item));
    this.branches.set(branches);
    const saving = this.pendingSave
      .catch(() => undefined)
      .then(async () => {
        if (dirty) await this.versionStore.save(dirty, draft);
        await this.repository.writeMany([
          [`draft:${draft.datasetId}`, draft],
          ...(dirty ? [[`draft:${draft.datasetId}:${dirty.id}`, draft] as const] : []),
          ...branches.map(item => [`draft-branch:${draft.datasetId}:${item.id}`, item] as const)
        ]);
      });
    this.pendingSave = saving;
    void saving
      .then(() => {
        if (sequence === this.saveSequence) this.saveStatus.set('已保存到本机');
      })
      .catch(error => {
        if (sequence !== this.saveSequence) return;
        this.saveStatus.set('保存失败');
        this.notice.set(`草稿保存失败：${String(error)}`);
      });
  }
  private reconcileBranchDirty(): void {
    const branch = this.activeBranch();
    if (!branch?.headCommitId) return;
    const dirty = this.diffChanges().length > 0;
    this.branches.update(branches => branches.map(item => (item.id === branch.id ? { ...item, dirty } : item)));
  }
  private async refreshDraftHistory(branch: DraftBranch): Promise<void> {
    const history = await this.versionStore.history(branch);
    const cached = new Map(this.commits().map(commit => [commit.id, commit]));
    const actual = history.commits.map(commit => ({ ...cached.get(commit.id), ...commit }));
    this.commits.set([...actual, ...this.commits().filter(commit => !actual.some(item => item.id === commit.id))]);
    this.branches.update(branches =>
      branches.map(item =>
        item.id === branch.id ? { ...item, dirty: history.dirty, headCommitId: history.headCommitId } : item
      )
    );
  }
  private clearDraftIndexes(): void {
    for (const key of this.indexes.keys()) if (key.includes(':draft:')) this.indexes.delete(key);
    this.diffIndex = null;
  }
  private getDiffIndex(): BomIndex | null {
    const data = this.dataset();
    const draft = this.diffBase();
    if (!data || !draft) return null;
    const key = `${data.id}:${draft.revision}:${draft.savedAt}`;
    if (this.diffIndex?.key === key) return this.diffIndex.index;
    const index = new BomIndex({ ...data, structures: { ...data.structures, draft: draft.nodes } }, 'draft');
    this.diffIndex = { key, index };
    return index;
  }
  private withDiff(current: ReturnType<BomIndex['query']>): ReturnType<BomIndex['query']> {
    const changes = this.diffChanges();
    if (!changes.length)
      return {
        roots: [],
        rows: [],
        byParent: new Map<string | null, BomRow[]>(),
        matched: 0,
        total: 0,
        truncated: false
      };
    const currentIndex = this.index();
    const baseIndex = this.getDiffIndex();
    const changedKeys = new Set(changes.map(change => change.key));
    const contextKeys = new Set(changedKeys);
    for (const change of changes) {
      for (const index of [currentIndex, baseIndex]) {
        if (!index?.nodes.has(change.key)) continue;
        for (const ancestor of index.ancestors(change.key)) contextKeys.add(ancestor.key);
      }
    }
    const query = this.query().mode === 'summary' ? { ...this.query(), mode: 'flat' as const } : this.query();
    const rows = new Map<string, BomRow>();
    for (const row of currentIndex?.query(query).rows ?? []) if (contextKeys.has(row.key)) rows.set(row.key, row);
    const previous = baseIndex && (!query.scope || baseIndex.nodes.has(query.scope)) ? baseIndex.query(query).rows : [];
    for (const row of previous)
      if (contextKeys.has(row.key) && !rows.has(row.key)) rows.set(row.key, currentIndex?.rows.get(row.key) ?? row);
    const changesByKey = new Map(changes.map(change => [change.key, change]));
    const projected = [...rows.values()].map(row => {
      const change = changesByKey.get(row.key);
      return change ? { ...row, diffStatus: change.kind, diffFields: [...change.fields] } : row;
    });
    const visible = new Set(projected.map(row => row.key));
    const byParent = new Map<string | null, BomRow[]>();
    for (const row of projected) {
      const parent = row.key === query.scope || (row.parentKey && !visible.has(row.parentKey)) ? null : row.parentKey;
      const siblings = byParent.get(parent) ?? [];
      siblings.push(parent === row.parentKey ? row : { ...row, parentKey: parent });
      byParent.set(parent, siblings);
    }
    return {
      roots: query.mode === 'tree' ? (byParent.get(null) ?? []) : projected,
      rows: projected,
      byParent,
      matched: projected.filter(row => row.diffStatus).length,
      total: projected.length,
      truncated: current.truncated
    };
  }
  private async persistView(): Promise<void> {
    const data = this.dataset();
    if (!data) return;
    try {
      await this.repository.write(`view:${data.id}`, { ...this.query(), expanded: this.expanded() });
    } catch (error) {
      this.notice.set(`视图保存失败：${String(error)}`);
    }
  }
  private beginLoad(): number {
    this.worker.cancel();
    this.request?.abort();
    this.request = new AbortController();
    this.loading.set(true);
    this.error.set('');
    this.saveSequence++;
    return ++this.loadSequence;
  }
  private sanitizeQuery(view: Partial<QuerySpec>): QuerySpec {
    const result = { ...DEFAULT_QUERY };
    if (
      ['catalog', 'purchase', 'cad', 'draft'].includes(String(view.structure)) &&
      (view.structure === 'draft' ? this.draft() : this.dataset()?.structures[view.structure as Structure].length)
    )
      result.structure = view.structure!;
    if (['tree', 'flat', 'summary'].includes(String(view.mode))) result.mode = view.mode!;
    if (['', 'EU', 'CN', 'US', 'AU'].includes(String(view.market))) result.market = view.market!;
    if (['all', 'conflict', 'quantity', 'unmapped'].includes(String(view.issue))) result.issue = view.issue!;
    if (['source', 'name', 'partId', 'quantity'].includes(String(view.sort))) result.sort = view.sort!;
    if (typeof view.search === 'string') result.search = view.search.slice(0, 500);
    for (const key of ['only3d', 'includeCatalog', 'descending'] as const)
      if (typeof view[key] === 'boolean') result[key] = view[key]!;
    return result;
  }
  private writeUrl(): void {
    const q = this.query();
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({
      structure: q.structure,
      view: q.mode,
      scope: q.scope,
      q: q.search,
      market: q.market,
      pn: this.selected()?.compId,
      occurrence: this.selection()
    })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    history.replaceState(null, '', url);
  }
  private readUrl(): void {
    const params = new URLSearchParams(location.search);
    const structure = params.get('structure');
    const mode = params.get('view');
    const patch: Partial<QuerySpec> = { search: params.get('q') ?? '' };
    if (
      structure &&
      ['catalog', 'purchase', 'cad', 'draft'].includes(structure) &&
      (structure === 'draft' ?
        Boolean(this.draft())
      : Boolean(this.dataset()?.structures[structure as Structure].length))
    )
      patch.structure = structure as Structure;
    if (mode && ['tree', 'flat', 'summary'].includes(mode)) patch.mode = mode as QuerySpec['mode'];
    if (['EU', 'CN', 'US', 'AU'].includes(params.get('market') ?? ''))
      patch.market = params.get('market') as QuerySpec['market'];
    this.query.update(q => ({ ...q, ...patch }));
    const scope = params.get('scope');
    if (scope && this.index()?.nodes.has(scope)) this.query.update(q => ({ ...q, scope }));
    const occurrence = params.get('occurrence');
    const pn = params.get('pn');
    const row =
      (occurrence ? this.index()?.rows.get(occurrence) : null) ??
      (pn ? [...(this.index()?.rows.values() ?? [])].find(r => r.compId === pn || r.partId === pn) : null);
    if (row) {
      this.selection.set(row.key);
      this.selectedKeys.set(new Set([row.key]));
      this.expanded.set(
        this.index()!
          .ancestors(row.key)
          .map(n => n.key)
      );
    }
  }
}
