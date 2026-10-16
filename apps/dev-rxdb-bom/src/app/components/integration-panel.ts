import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';

/** 用同一领域合同导出快照、原子导入草稿并显式发布。 */
@Component({
  selector: 'bom-integration-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>导出与导入</h2>
        <p class="panel-desc">导出当前展开的主数据与解析依据。导入 JSON 记录数组先保存草稿，全部通过后再显式发布。</p>
      </div>
      <div class="toolbar">
        <button
          class="btn"
          [disabled]="busy() || !ready() || !expanded()"
          (click)="download()"
          data-testid="export-bom"
        >
          导出 BOM JSON
        </button>
        <label
          >导入文件
          <input (change)="chooseFile($event)" accept="application/json,.json" data-testid="import-file" type="file"
        /></label>
        <button
          class="btn btn-primary"
          [disabled]="busy() || !ready() || !file()"
          (click)="importDraft()"
          data-testid="import-bom"
        >
          导入为草稿
        </button>
      </div>
      @if (exportStatus()) {
        <p [class.error-box]="exportFailed()" [class.hint]="!exportFailed()" role="status">{{ exportStatus() }}</p>
      }
      @if (status()) {
        <p [class.error-box]="failed()" [class.status-success]="!failed()" data-testid="import-status" role="status">
          {{ status() }}
        </p>
      }
      @if (diagnostics().length > 0) {
        <ul class="diagnostics" data-testid="import-diagnostics">
          @for (diagnostic of diagnostics(); track $index) {
            <li>{{ diagnostic }}</li>
          }
        </ul>
      }
      @if (headerIds().length > 0) {
        <div class="toolbar">
          <label>发布生效日 <input [(ngModel)]="publishDate" data-testid="import-publish-date" type="date" /></label>
          <button class="btn btn-primary" [disabled]="busy()" (click)="publish()" data-testid="import-publish">
            发布导入草稿
          </button>
        </div>
      }
      @if (busy()) {
        <p class="hint" role="status">正在处理文件…</p>
      }
    </section>
  `
})
export class IntegrationPanel {
  private readonly service = inject(BomDemoService);
  readonly asOfDate = input.required<string>();
  readonly rootKey = input.required<string>();
  readonly plannedQty = input.required<string>();
  readonly unit = input<number>();
  readonly expanded = input(false);
  readonly ready = this.service.ready;
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly file = signal<File | null>(null);
  readonly status = signal('');
  readonly exportStatus = signal('');
  readonly exportFailed = signal(false);
  readonly diagnostics = signal<string[]>([]);
  readonly headerIds = signal<string[]>([]);
  readonly publishDate = signal(new Date().toISOString().slice(0, 10));

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.headerIds.set([]);
      this.status.set('');
      this.diagnostics.set([]);
      this.exportStatus.set('');
    });
  }

  /** 选择待校验的文件，清空前一批诊断。 */
  chooseFile(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.file.set(event.target.files?.[0] ?? null);
    this.status.set('');
    this.diagnostics.set([]);
  }

  /** 下载带解析依据与规范十进制字符串的快照。 */
  async download(): Promise<void> {
    this.busy.set(true);
    this.exportStatus.set('');
    this.exportFailed.set(false);
    try {
      const json = await this.service.exportBom(this.asOfDate(), this.rootKey(), this.plannedQty(), this.unit());
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.rootKey()}-${this.asOfDate()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.exportStatus.set('导出成功：文件包含 manifest，十进制字段为字符串。');
    } catch (error) {
      this.exportFailed.set(true);
      this.exportStatus.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 整批导入草稿，展示全部失败记录的源标识。 */
  async importDraft(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.busy.set(true);
    this.status.set('');
    this.diagnostics.set([]);
    this.headerIds.set([]);
    try {
      const payload: unknown = JSON.parse(await file.text());
      const result = await this.service.importBom(payload);
      this.failed.set(!result.committed);
      this.diagnostics.set(result.diagnostics.map(value => value.message));
      this.headerIds.set(result.headerIds);
      this.status.set(
        result.committed ? '导入成功：已保存草稿，等待显式发布。' : '导入失败：整批回滚，没有写入任何记录。'
      );
    } catch (error) {
      this.failed.set(true);
      this.status.set(`导入失败：${String(error)}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** 按显式生效日发布已校验的导入草稿。 */
  async publish(): Promise<void> {
    this.busy.set(true);
    try {
      await this.service.publishImported(this.headerIds(), this.publishDate());
      this.failed.set(false);
      this.headerIds.set([]);
      this.status.set(`发布成功：评估日不早于 ${this.publishDate()} 时可展开导入物料。`);
    } catch (error) {
      this.failed.set(true);
      this.status.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
