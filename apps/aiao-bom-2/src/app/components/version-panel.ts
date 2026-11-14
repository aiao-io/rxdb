import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { parseSnapshot, type BomSnapshot, type SnapshotChange, type SnapshotChangeField } from '../core/snapshot';
import type { Occurrence, Structure } from '../core/types';
import { BomWorkspace } from '../core/workspace';

const STRUCTURES: Record<Structure, string> = { catalog: '系统分类', purchase: '采购层级', cad: 'CAD 场景', draft: '工作草稿' };
const LABELS: Record<SnapshotChangeField, string> = {
  replacement: '物料 / 变体', parent: '父位置', quantity: '直接用量', quantityState: '用量状态',
  uom: '单位', unitCost: '单位成本', label: '名称', markets: '适用市场', identity: '类型 / 来源 / 模型'
};
@Component({
  selector: 'bom2-version-panel', imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './version-panel.html', styleUrl: './version-panel.scss'
})
export class VersionPanel implements OnInit {
  private fileRequest = 0;
  readonly ws = inject(BomWorkspace);
  readonly versions = this.ws.versions;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    evaluationDate: new FormControl('', { nonNullable: true, validators: Validators.required })
  });
  readonly error = signal('');
  readonly incoming = signal<BomSnapshot | null>(null);
  readonly filter = signal('all');
  readonly search = signal('');
  readonly offset = signal(0);
  readonly pageSize = 100;
  readonly changes = computed(() => (this.versions.result()?.changes ?? []).filter(change => this.matches(change)));
  readonly page = computed(() => Math.min(this.offset(), Math.max(0, Math.ceil(this.changes().length / this.pageSize) - 1)));
  readonly visible = computed(() => this.changes().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize));
  readonly structureName = computed(() => STRUCTURES[this.ws.query().structure]);

  ngOnInit(): void { this.form.controls.evaluationDate.setValue(this.ws.dataset()?.observedOn ?? ''); }
  value(event: Event): string { return (event.target as HTMLInputElement).value; }
  name(structure: Structure): string { return STRUCTURES[structure]; }
  label(field: SnapshotChangeField): string { return LABELS[field]; }
  fields(change: SnapshotChange): SnapshotChangeField[] { return change.kind === 'changed' ? change.fields : ['replacement', 'quantity', 'quantityState', 'uom', 'parent']; }
  kind(change: SnapshotChange): string { return { added: '新增位置', removed: '删除位置', changed: '修改位置' }[change.kind]; }
  fieldValue(node: Occurrence | null, field: SnapshotChangeField): string {
    if (!node) return '∅';
    if (field === 'replacement') return node.compId === node.partId ? node.partId : `${node.partId} / ${node.compId}`;
    if (field === 'parent') return node.parentKey ?? '根位置';
    if (field === 'markets') return node.markets.join(' / ') || '未声明';
    if (field === 'identity') return `${node.kind} · ${node.source} · ${node.sourceRef} · 模型 ${node.nodeIndex ?? '—'}`;
    if (field === 'quantityState') return { missing: '缺失', ambiguous: '歧义', reference: '来源参考', confirmed: '已确认' }[node.quantityState];
    return String(node[field] ?? '未填写');
  }
  setFilter(value: string): void { this.filter.set(value); this.offset.set(0); }
  setSearch(value: string): void { this.search.set(value); this.offset.set(0); }
  async choose(side: 'before' | 'after', id: string): Promise<void> {
    this.error.set(''); this.offset.set(0); await this.versions.choose(side, id);
  }
  async save(event?: Event): Promise<void> {
    event?.preventDefault(); this.error.set('');
    if (this.form.invalid) { this.error.set('请填写快照名称和评估日期。'); return; }
    const value = this.form.getRawValue();
    try { await this.ws.saveSnapshot(value.name, value.evaluationDate); this.offset.set(0); }
    catch (error) { this.fail(error); }
  }
  async file(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const request = ++this.fileRequest;
    this.incoming.set(null); this.error.set('');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('快照文件超过 50 MB');
      const snapshot = parseSnapshot(JSON.parse(await file.text()));
      if (snapshot.datasetId !== this.ws.dataset()?.id) throw new Error('快照属于其他产品数据集');
      if (request === this.fileRequest) this.incoming.set(snapshot);
    } catch (error) { if (request === this.fileRequest) this.fail(error); }
  }
  async acceptImport(): Promise<void> {
    const snapshot = this.incoming();
    if (!snapshot) return;
    this.error.set('');
    try { await this.versions.save(snapshot); this.incoming.set(null); this.offset.set(0); }
    catch (error) { this.fail(error); }
  }
  async downloadSnapshot(): Promise<void> {
    this.error.set('');
    try {
      const snapshot = await this.versions.exportSelected();
      this.download('aiao-bom-2-snapshot.json', JSON.stringify(snapshot, null, 2));
    } catch (error) { this.fail(error); }
  }
  downloadDiff(): void {
    const diff = this.versions.result();
    if (diff) this.download('aiao-bom-2-revision-diff.json', JSON.stringify(diff, null, 2));
  }
  private matches(change: SnapshotChange): boolean {
    const filter = this.filter();
    const matchesKind = filter === 'all' || change.kind === filter || change.fields.includes(filter as SnapshotChangeField);
    const text = `${change.key} ${change.before?.partId} ${change.after?.partId} ${change.before?.compId} ${change.after?.compId} ${change.before?.label ?? ''} ${change.after?.label ?? ''}`.toLowerCase();
    return matchesKind && text.includes(this.search().trim().toLowerCase());
  }
  private fail(error: unknown): void { this.error.set(error instanceof Error ? error.message : String(error)); }
  private download(filename: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
