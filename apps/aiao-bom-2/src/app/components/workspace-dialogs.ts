import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BomWorkspace } from '../core/workspace';
import { compareDrafts, exportCsv, validateDraft } from '../core/draft';
import { analyzeDraft } from '../core/analysis';
import type { DraftState } from '../core/types';
import { Icon } from './icon';
import { prepareDomainDraft } from '../core/domain-export';
import { WorkspaceRepository } from '../core/storage';
import { VersionPanel } from './version-panel';
export type DialogKind = 'help' | 'sources' | 'fork' | 'import' | 'export' | 'edit' | 'add' | 'move' | 'remove' | 'validate' | 'analysis' | 'compare' | 'revision' | 'stress';
const TITLES: Record<DialogKind, string> = { help: 'BOM 工作台使用说明', sources: '数据来源与使用口径', fork: '建立工作草稿', import: '导入 BOM 草稿', export: '导出当前数据', edit: '编辑所选发生项', add: '新增发生项', move: '移动发生项', remove: '删除所选发生项', validate: '草稿校验', analysis: '需求展开与成本', compare: '草稿差异比较', revision: '版本快照与日期比较', stress: '大规模 BOM 验收' };
@Component({ selector: 'bom2-workspace-dialogs', imports: [Icon, DecimalPipe, VersionPanel], templateUrl: './workspace-dialogs.html', styleUrl: './workspace-dialogs.scss' })
export class WorkspaceDialogs {
  readonly ws = inject(BomWorkspace);
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly kind = signal<DialogKind>('help');
  readonly title = computed(() => TITLES[this.kind()]);
  readonly error = signal('');
  readonly preview = signal<DraftState | null>(null);
  readonly analysis = signal<ReturnType<typeof analyzeDraft> | null>(null);
  readonly diagnostics = computed(() => this.ws.draft() ? validateDraft(this.ws.draft()!) : []);
  readonly differences = computed(() => this.ws.draft() && this.ws.baseline() ? compareDrafts(this.ws.baseline()!, this.ws.draft()!) : []);
  readonly parents = computed(() => this.ws.draft()?.nodes.filter(n => n.key !== this.ws.selection()).slice(0, 1500) ?? []);
  readonly busy = signal(false);
  readonly today = new Date().toLocaleDateString('en-CA');
  open(kind: DialogKind): void {
    this.kind.set(kind); this.error.set(''); this.preview.set(null); this.analysis.set(null);
    this.dialog().nativeElement.showModal();
    if (kind === 'revision' && this.ws.versions.entries().length) void this.ws.versions.compare();
  }
  close(): void { if (this.kind() === 'stress' && this.busy() && this.ws.loading()) this.ws.cancelLoad(); this.dialog().nativeElement.close(); }
  submit(event: Event): void {
    event.preventDefault(); this.error.set('');
    const form = event.target as HTMLFormElement; const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    try {
      switch (this.kind()) {
        case 'fork': this.ws.fork(); this.close(); break;
        case 'edit': this.ws.edit([...this.ws.selectedKeys()], text('quantity'), text('uom'), text('cost') || null); this.close(); break;
        case 'add': this.ws.add(text('parent') || null, text('partId'), text('quantity'), text('uom')); this.close(); break;
        case 'move': this.ws.move([...this.ws.selectedKeys()][0], text('parent') || null); this.close(); break;
        case 'remove': this.ws.remove([...this.ws.selectedKeys()]); this.close(); break;
        case 'import': if (this.preview()) { this.ws.acceptImport(this.preview()!); this.close(); } else this.preview.set(this.ws.importDraft(text('json')).draft); break;
        case 'analysis': if (!this.ws.draft()) throw new Error('请先从来源结构建立工作草稿'); this.analysis.set(analyzeDraft(this.ws.draft()!, text('planned'))); break;
        case 'stress': void this.stress(Number(text('count')), text('shape') as 'balanced' | 'wide' | 'deep'); break;
        default: break;
      }
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  async sendToDomain(form: HTMLFormElement): Promise<void> {
    this.error.set('');
    try {
      const draft = this.ws.draft(); if (!draft) throw new Error('请先建立工作草稿');
      const data = new FormData(form);
      const envelope = prepareDomainDraft(draft, { rootKey: this.ws.selection() ?? '', revisionNo: String(data.get('domainRevision') ?? ''),
        orgId: String(data.get('domainOrg') ?? ''), effectiveFrom: String(data.get('domainDate') ?? ''), confirmed: data.get('domainConfirmed') === 'on' });
      await new WorkspaceRepository().write('domain:pending', envelope);
      location.assign('/transfer');
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  async file(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('导入文件超过 50 MB');
      this.preview.set(this.ws.importDraft(await file.text()).draft); this.error.set('');
    } catch (error) { this.preview.set(null); this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  download(format: 'csv' | 'json'): void {
    const draft = this.ws.draft();
    if (format === 'json' && !draft) { this.error.set('请先建立草稿。CSV 可直接导出当前来源视图。'); return; }
    const contents = format === 'json' ? JSON.stringify(draft, null, 2) : exportCsv(this.ws.result().rows.map(r => ({ ...r, label: r.name })));
    const url = URL.createObjectURL(new Blob([contents], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `aiao-bom-2-${format === 'json' ? 'draft' : this.ws.query().structure}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.ws.notice.set(`已导出 ${format === 'json' ? draft!.nodes.length : this.ws.result().rows.length} 条记录。`);
  }
  locate(key: string): void { this.ws.locate(key); this.close(); }
  async realData(): Promise<void> { this.close(); await this.ws.loadWindrose(); }
  private async stress(count: number, shape: 'balanced' | 'wide' | 'deep'): Promise<void> {
    this.busy.set(true);
    try { await this.ws.loadStress(count, shape); this.close(); }
    catch (error) { this.error.set(String(error)); }
    finally { this.busy.set(false); }
  }
}
