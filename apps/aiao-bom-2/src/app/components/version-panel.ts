import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { compareDraftsDetailed, type DraftChange, type DraftChangeField } from '../core/draft';
import type { SnapshotChange, SnapshotChangeField } from '../core/snapshot';
import type { DraftCommit, Occurrence, Structure } from '../core/types';
import { BomWorkspace } from '../core/workspace';

const STRUCTURES: Record<Structure, string> = {
  catalog: '系统分类',
  purchase: '采购层级',
  cad: 'CAD 场景',
  draft: '工作草稿'
};
const LABELS: Record<SnapshotChangeField, string> = {
  replacement: '物料 / 变体',
  parent: '父位置',
  quantity: '直接用量',
  quantityState: '用量状态',
  uom: '单位',
  unitCost: '单位成本',
  label: '名称',
  markets: '适用市场',
  identity: '类型 / 来源 / 模型'
};
@Component({
  selector: 'bom2-version-panel',
  imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './version-panel.html',
  styleUrl: './version-panel.scss'
})
export class VersionPanel implements OnInit {
  readonly ws = inject(BomWorkspace);
  readonly versions = this.ws.versions;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    evaluationDate: new FormControl('', { nonNullable: true, validators: Validators.required })
  });
  readonly error = signal('');
  readonly snapshotToolsOpen = signal(false);
  readonly historyTab = signal<'changes' | 'history'>('changes');
  readonly selectedCommitId = signal<string | null>(null);
  readonly historyOffset = signal(0);
  readonly commitMessage = new FormControl('', { nonNullable: true });
  readonly filter = signal('all');
  readonly search = signal('');
  readonly offset = signal(0);
  readonly pageSize = 100;
  readonly changes = computed(() => (this.versions.result()?.changes ?? []).filter(change => this.matches(change)));
  readonly page = computed(() =>
    Math.min(this.offset(), Math.max(0, Math.ceil(this.changes().length / this.pageSize) - 1))
  );
  readonly visible = computed(() =>
    this.changes().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize)
  );
  readonly structureName = computed(() => STRUCTURES[this.ws.query().structure]);
  readonly branches = computed(() =>
    [...this.ws.branches()].sort(
      (left, right) => Number(right.active) - Number(left.active) || right.updatedAt.localeCompare(left.updatedAt)
    )
  );
  readonly activeBranch = computed(() => this.ws.activeBranch());
  readonly currentChanges = computed(() => this.ws.diffChanges());
  readonly headCommit = computed(() => {
    const branch = this.activeBranch();
    return branch?.headCommitId ? this.ws.commits().find(commit => commit.id === branch.headCommitId) : undefined;
  });
  readonly branchCommits = computed(() => {
    const commits = new Map(this.ws.commits().map(commit => [commit.id, commit]));
    const history: DraftCommit[] = [];
    let id = this.activeBranch()?.headCommitId;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const commit = commits.get(id);
      if (!commit) break;
      history.push(commit);
      id = commit.parentId;
    }
    return history;
  });

  readonly selectedCommit = computed<DraftCommit | undefined>(
    () => this.branchCommits().find(commit => commit.id === this.selectedCommitId()) ?? this.branchCommits()[0]
  );
  readonly selectedCommitChanges = computed(() => {
    const commit = this.selectedCommit();
    if (!commit) return [];
    const previous = this.ws.commits().find(item => item.id === commit.parentId)?.draft;
    return compareDraftsDetailed(previous ?? { ...commit.draft, nodes: [] }, commit.draft);
  });
  readonly visibleCommitChanges = computed(() =>
    this.selectedCommitChanges().slice(this.historyOffset() * this.pageSize, (this.historyOffset() + 1) * this.pageSize)
  );

  chooseCommit(id: string): void {
    this.selectedCommitId.set(id);
    this.historyOffset.set(0);
  }
  changeDetails(change: DraftChange): string {
    const fields = change.kind === 'changed' ? change.fields : (['quantity', 'uom'] as const);
    return fields
      .map(
        field =>
          `${this.changeFields([field])}：${this.draftValue(change.before, field)} → ${this.draftValue(change.after, field)}`
      )
      .join('；');
  }
  ngOnInit(): void {
    this.form.controls.evaluationDate.setValue(this.ws.dataset()?.observedOn ?? '');
  }
  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  name(structure: Structure): string {
    return STRUCTURES[structure];
  }
  shortId(id: string): string {
    return id.slice(-8);
  }
  commitDate(value: string): string {
    return value.slice(0, 16).replace('T', ' ');
  }
  canCompare(commit: DraftCommit): boolean {
    return Boolean(commit.snapshotId && this.ws.commits().find(item => item.id === commit.parentId)?.snapshotId);
  }
  async compareCommit(commit: DraftCommit): Promise<void> {
    const parent = this.ws.commits().find(item => item.id === commit.parentId);
    if (!parent?.snapshotId || !commit.snapshotId) return;
    await this.choose('before', parent.snapshotId);
    await this.choose('after', commit.snapshotId);
    this.snapshotToolsOpen.set(true);
  }
  changeKind(kind: 'added' | 'removed' | 'changed'): string {
    return { added: 'U 新增', removed: '删除', changed: 'M 修改' }[kind];
  }
  changeFields(fields: string[]): string {
    const labels: Record<string, string> = {
      quantity: '直接用量',
      quantityState: '用量状态',
      uom: '单位',
      unitCost: '单位成本',
      parentKey: '父位置',
      partId: '物料编码',
      compId: '变体件号',
      label: '名称',
      markets: '适用市场'
    };
    return fields.map(field => labels[field] ?? field).join('、');
  }
  async commitCurrent(): Promise<void> {
    this.error.set('');
    try {
      await this.ws.commitDraft(this.commitMessage.value);
      this.commitMessage.setValue('');
    } catch (error) {
      this.fail(error);
    }
  }
  async restoreCommit(id: string): Promise<void> {
    this.error.set('');
    try {
      await this.ws.restoreCommit(id);
      this.historyTab.set('changes');
    } catch (error) {
      this.fail(error);
    }
  }
  label(field: SnapshotChangeField): string {
    return LABELS[field];
  }
  fields(change: SnapshotChange): SnapshotChangeField[] {
    return change.kind === 'changed' ? change.fields : ['replacement', 'quantity', 'quantityState', 'uom', 'parent'];
  }
  kind(change: SnapshotChange): string {
    return { added: '新增位置', removed: '删除位置', changed: '修改位置' }[change.kind];
  }
  fieldValue(node: Occurrence | null, field: SnapshotChangeField): string {
    if (!node) return '∅';
    if (field === 'replacement') return node.compId === node.partId ? node.partId : `${node.partId} / ${node.compId}`;
    if (field === 'parent') return node.parentKey ?? '根位置';
    if (field === 'markets') return node.markets.join(' / ') || '未声明';
    if (field === 'identity')
      return `${node.kind} · ${node.source} · ${node.sourceRef} · 模型 ${node.nodeIndex ?? '—'}`;
    if (field === 'quantityState')
      return { missing: '缺失', ambiguous: '歧义', reference: '来源参考', confirmed: '已确认' }[node.quantityState];
    return String(node[field] ?? '未填写');
  }
  setFilter(value: string): void {
    this.filter.set(value);
    this.offset.set(0);
  }
  setSearch(value: string): void {
    this.search.set(value);
    this.offset.set(0);
  }
  async choose(side: 'before' | 'after', id: string): Promise<void> {
    this.error.set('');
    this.offset.set(0);
    await this.versions.choose(side, id);
  }
  async save(event?: Event): Promise<void> {
    event?.preventDefault();
    this.error.set('');
    if (this.form.invalid) {
      this.error.set('请填写快照名称和评估日期。');
      return;
    }
    const value = this.form.getRawValue();
    try {
      await this.ws.saveSnapshot(value.name, value.evaluationDate);
      this.offset.set(0);
    } catch (error) {
      this.fail(error);
    }
  }
  private draftValue(node: Occurrence | null, field: DraftChangeField): string {
    if (!node) return '∅';
    if (field === 'parentKey') return node.parentKey ?? '根位置';
    if (field === 'quantityState') return this.fieldValue(node, 'quantityState');
    const value = node[field];
    return Array.isArray(value) ? value.join(' / ') || '未声明' : String(value ?? '—');
  }
  private matches(change: SnapshotChange): boolean {
    const filter = this.filter();
    const matchesKind =
      filter === 'all' || change.kind === filter || change.fields.includes(filter as SnapshotChangeField);
    const text =
      `${change.key} ${change.before?.partId} ${change.after?.partId} ${change.before?.compId} ${change.after?.compId} ${change.before?.label ?? ''} ${change.after?.label ?? ''}`.toLowerCase();
    return matchesKind && text.includes(this.search().trim().toLowerCase());
  }
  private fail(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : String(error));
  }
}
