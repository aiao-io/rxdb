import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { analyzeDraft } from '../core/analysis';
import { compareDrafts, validateDraft } from '../core/draft';
import { BomWorkspace } from '../core/workspace';
import { Icon } from './icon';
import { VersionPanel } from './version-panel';
export type DialogKind =
  | 'help'
  | 'sources'
  | 'fork'
  | 'commit'
  | 'edit'
  | 'add'
  | 'move'
  | 'remove'
  | 'validate'
  | 'analysis'
  | 'compare'
  | 'revision'
  | 'stress';
const TITLES: Record<DialogKind, string> = {
  help: 'BOM 工作台使用说明',
  sources: '数据来源与使用口径',
  fork: '建立工作草稿',
  commit: '提交工作版本',
  edit: '编辑所选发生项',
  add: '新增发生项',
  move: '移动发生项',
  remove: '删除所选发生项',
  validate: '草稿校验',
  analysis: '需求展开与成本',
  compare: '草稿差异比较',
  revision: '版本快照与日期比较',
  stress: '大规模 BOM 验收'
};
@Component({
  selector: 'bom2-workspace-dialogs',
  imports: [Icon, DecimalPipe, VersionPanel],
  templateUrl: './workspace-dialogs.html',
  styleUrl: './workspace-dialogs.scss'
})
export class WorkspaceDialogs {
  readonly ws = inject(BomWorkspace);
  readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly kind = signal<DialogKind>('help');
  readonly title = computed(() => TITLES[this.kind()]);
  readonly error = signal('');
  readonly analysis = signal<ReturnType<typeof analyzeDraft> | null>(null);
  readonly diagnostics = computed(() => (this.ws.draft() ? validateDraft(this.ws.draft()!) : []));
  readonly differences = computed(() =>
    this.ws.draft() && this.ws.baseline() ? compareDrafts(this.ws.baseline()!, this.ws.draft()!) : []
  );
  readonly parents = computed(
    () =>
      this.ws
        .draft()
        ?.nodes.filter(n => n.key !== this.ws.selection())
        .slice(0, 1500) ?? []
  );
  readonly busy = signal(false);
  open(kind: DialogKind): void {
    this.kind.set(kind);
    this.error.set('');
    this.analysis.set(null);
    this.dialog().nativeElement.showModal();
    if (kind === 'revision' && this.ws.versions.entries().length) void this.ws.versions.compare();
  }
  close(): void {
    if (this.kind() === 'stress' && this.busy() && this.ws.loading()) this.ws.cancelLoad();
    this.dialog().nativeElement.close();
  }
  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    this.error.set('');
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    try {
      switch (this.kind()) {
        case 'fork':
          this.ws.fork(text('branchName'));
          this.close();
          break;
        case 'commit':
          this.busy.set(true);
          await this.ws.commitDraft(text('message'));
          this.close();
          this.busy.set(false);
          break;
        case 'edit':
          this.ws.edit([...this.ws.selectedKeys()], text('quantity'), text('uom'), text('cost') || null);
          this.close();
          break;
        case 'add':
          this.ws.add(text('parent') || null, text('partId'), text('quantity'), text('uom'));
          this.close();
          break;
        case 'move':
          this.ws.move([...this.ws.selectedKeys()][0], text('parent') || null);
          this.close();
          break;
        case 'remove':
          this.ws.remove([...this.ws.selectedKeys()]);
          this.close();
          break;
        case 'analysis':
          if (!this.ws.draft()) throw new Error('请先从来源结构建立工作草稿');
          this.analysis.set(analyzeDraft(this.ws.draft()!, text('planned')));
          break;
        case 'stress':
          void this.stress(Number(text('count')), text('shape') as 'balanced' | 'wide' | 'deep');
          break;
        default:
          break;
      }
    } catch (error) {
      this.busy.set(false);
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
  locate(key: string): void {
    this.ws.locate(key);
    this.close();
  }
  async realData(): Promise<void> {
    this.close();
    await this.ws.loadWindrose();
  }
  private async stress(count: number, shape: 'balanced' | 'wide' | 'deep'): Promise<void> {
    this.busy.set(true);
    try {
      await this.ws.loadStress(count, shape);
      this.close();
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
