import type { ExplosionManifest, ImportDiagnostic } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService, type BomDemoResolutionOptions } from '../bom-demo.service';
import { assertExportSnapshot, ExportSnapshotChangedError } from '../presentation/export-snapshot';

/** 下载结构快照，或将文件导入草稿并经明确操作发布。 */
@Component({
  selector: 'bom-integration-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel" [attr.aria-busy]="busy()">
      <div class="panel-head">
        <h2>导入与导出</h2>
        <p class="panel-desc">下载当前结构文件，或把文件导入为草稿。导入成功后仍需核对生效日期，再明确发布。</p>
      </div>
      <div class="summary-grid">
        <section class="panel-inset">
          <h3>下载当前结构</h3>
          <p class="hint">文件包含当前展开条件与对应的结构数据。</p>
          <button
            class="btn result-title"
            [disabled]="busy() || !ready() || resetting() || !expanded() || expectedManifest() === null"
            (click)="download()"
            data-testid="export-bom"
          >
            下载结构文件（JSON）
          </button>
          @if (!expanded()) {
            <p class="hint result-title">请先完成上方整机展开，再下载结构。</p>
          }
          @if (exportStatus()) {
            <div
              [attr.role]="exportFailed() ? 'alert' : 'status'"
              [class.error-box]="exportFailed()"
              [class.status-success]="!exportFailed()"
            >
              <p>{{ exportStatus() }}</p>
              @if (exportReason()) {
                <details>
                  <summary>查看具体原因</summary>
                  <pre>{{ exportReason() }}</pre>
                </details>
              }
            </div>
          }
        </section>
        <section class="panel-inset">
          <h3>从文件导入草稿</h3>
          <div class="toolbar result-title">
            <label>
              选择结构文件
              <input
                [disabled]="busy()"
                (change)="chooseFile($event)"
                accept="application/json,.json"
                data-testid="import-file"
                type="file"
              />
            </label>
            <button
              class="btn btn-primary"
              [disabled]="busy() || !ready() || !file()"
              (click)="importDraft()"
              data-testid="import-bom"
            >
              导入为草稿
            </button>
          </div>
          @if (file(); as selectedFile) {
            <p class="hint result-title">已选择 {{ selectedFile.name }}</p>
          }
        </section>
      </div>
      @if (busy()) {
        <p class="hint result-title" role="status">正在处理结构文件，请稍候…</p>
      }
      @if (status()) {
        <div
          [attr.role]="failed() ? 'alert' : 'status'"
          [class.error-box]="failed()"
          [class.status-success]="!failed()"
          data-testid="import-status"
        >
          <p>{{ status() }}</p>
          @if (reason()) {
            <details>
              <summary>查看具体原因</summary>
              <pre>{{ reason() }}</pre>
            </details>
          }
        </div>
      }
      @if (diagnostics().length > 0) {
        <details class="details-panel result-title">
          <summary>查看 {{ diagnostics().length }} 条记录的问题</summary>
          <ul class="diagnostics" data-testid="import-diagnostics">
            @for (diagnostic of diagnostics(); track $index) {
              <li>
                <strong>{{ diagnosticKind(diagnostic.kind) }}</strong>
                <code>{{ diagnostic.naturalKey }}</code>
                <p>{{ diagnostic.message }}</p>
              </li>
            }
          </ul>
        </details>
      }
      @if (drafts().length > 0) {
        <section class="panel-inset result-title">
          <h3>核对并发布</h3>
          <p class="hint">
            数据库中有 {{ drafts().length }} 份待发布结构。勾选本次要发布的对象，再核对生效日期；未勾选的草稿保持原样。
          </p>
          <button class="btn" [disabled]="busy() || resetting()" (click)="selectAllDrafts()">全选待发布草稿</button>
          <ul class="draft-list">
            @for (draft of drafts(); track draft.headerId) {
              <li>
                <label>
                  <input
                    [checked]="headerIds().includes(draft.headerId)"
                    [disabled]="busy() || resetting()"
                    (change)="toggleDraft(draft.headerId)"
                    data-testid="import-draft-select"
                    type="checkbox"
                  />
                  {{ draft.itemNo }} · 修订 {{ draft.revisionNo }} · {{ draft.bomType }} · {{ draft.orgId }} ·
                  {{ draft.lineCount }} 行
                </label>
              </li>
            }
          </ul>
          <p class="hint">已选 {{ headerIds().length }} 份；发布失败时整批保留草稿，可修正后重试。</p>
          <p class="hint">输入日期只用于新修订。已有发布修订和发生项保留原日期，请按各自的实际生效条件核对展开结果。</p>
          <div class="toolbar result-title">
            <label
              >新修订生效日期
              <input [(ngModel)]="publishDate" [disabled]="busy()" data-testid="import-publish-date" type="date"
            /></label>
            <button
              class="btn btn-primary"
              [disabled]="busy() || !ready() || resetting() || headerIds().length === 0 || !publishDate()"
              (click)="publish()"
              data-testid="import-publish"
            >
              发布导入草稿
            </button>
          </div>
        </section>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .panel-inset {
        min-width: 0;
      }
      .toolbar label {
        min-width: 0;
      }
      input[type='file'] {
        max-width: 100%;
      }
      pre {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    `
  ]
})
export class IntegrationPanel {
  private readonly service = inject(BomDemoService);
  readonly asOfDate = input.required<string>();
  readonly rootKey = input.required<string>();
  readonly plannedQty = input.required<string>();
  readonly unit = input<number>();
  readonly resolutionOptions = input<BomDemoResolutionOptions>({});
  readonly expectedManifest = input<ExplosionManifest | null>(null);
  readonly expanded = input(false);
  readonly ready = this.service.ready;
  readonly resetting = this.service.resetting;
  readonly drafts = this.service.importedDrafts;
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly file = signal<File | null>(null);
  readonly status = signal('');
  readonly reason = signal('');
  readonly exportStatus = signal('');
  readonly exportFailed = signal(false);
  readonly exportReason = signal('');
  readonly diagnostics = signal<ImportDiagnostic[]>([]);
  readonly headerIds = signal<string[]>([]);
  readonly publishDate = signal(new Date().toISOString().slice(0, 10));

  constructor() {
    effect(() => {
      const epoch = this.service.dataEpoch();
      if (this.ready() && !this.resetting()) {
        void this.#recoverDrafts(epoch);
        return;
      }
      this.headerIds.set([]);
      this.status.set('');
      this.reason.set('');
      this.diagnostics.set([]);
      this.exportStatus.set('');
      this.exportReason.set('');
    });
  }

  /** 文件选择只清理文件诊断，已经保存的待发布草稿继续可见。 */
  chooseFile(event: Event): void {
    if (this.busy() || !(event.target instanceof HTMLInputElement)) return;
    this.file.set(event.target.files?.[0] ?? null);
    this.status.set('');
    this.reason.set('');
    this.diagnostics.set([]);
  }

  toggleDraft(headerId: string): void {
    this.headerIds.update(current =>
      current.includes(headerId) ? current.filter(id => id !== headerId) : [...current, headerId]
    );
  }

  selectAllDrafts(): void {
    this.headerIds.set(this.drafts().map(draft => draft.headerId));
  }

  diagnosticKind(kind: ImportDiagnostic['kind']): string {
    const labels: Record<ImportDiagnostic['kind'], string> = {
      item: '物料',
      revision: '修订',
      header: '结构头',
      line: '逻辑行',
      occurrence: '发生项',
      designator: '位号',
      substitute_group: '替代组',
      operation_split: '工序分摊'
    };
    return labels[kind];
  }

  /** 下载保留原始十进制字符串与解析依据的结构文件。 */
  async download(): Promise<void> {
    if (this.busy() || !this.ready() || this.resetting() || !this.expanded() || this.expectedManifest() === null)
      return;
    const epoch = this.service.dataEpoch();
    const revision = this.service.dataRevision();
    const expected = this.expectedManifest();
    if (expected === null) return;
    this.busy.set(true);
    this.exportStatus.set('');
    this.exportReason.set('');
    this.exportFailed.set(false);
    try {
      const json = await this.service.exportBom(this.asOfDate(), this.rootKey(), this.plannedQty(), {
        unit: this.unit(),
        ...this.resolutionOptions()
      });
      if (epoch !== this.service.dataEpoch()) return;
      if (!this.expanded() || revision !== this.service.dataRevision()) throw new ExportSnapshotChangedError();
      assertExportSnapshot(json, expected);
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${this.rootKey()}-${this.asOfDate()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      this.exportStatus.set('导出成功：结构文件已下载，可用于备份或交换。');
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.exportFailed.set(true);
      this.exportStatus.set(
        error instanceof ExportSnapshotChangedError ? error.message : '导出失败：无法生成当前结构文件。'
      );
      this.exportReason.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 整批校验后导入草稿，失败保留具体记录的诊断。 */
  async importDraft(): Promise<void> {
    const file = this.file();
    if (this.busy() || !this.ready() || this.resetting() || !file) return;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.status.set('');
    this.reason.set('');
    this.failed.set(false);
    this.diagnostics.set([]);
    this.headerIds.set([]);
    try {
      const payload: unknown = JSON.parse(await file.text());
      if (epoch !== this.service.dataEpoch() || this.resetting() || !this.ready()) return;
      const result = await this.service.importBom(payload);
      if (epoch !== this.service.dataEpoch()) return;
      this.failed.set(!result.committed);
      this.diagnostics.set(result.diagnostics);
      if (result.committed) this.headerIds.set(result.headerIds);
      this.status.set(
        result.committed ? '导入成功：已保存草稿，核对后再发布。' : '导入失败：整批未写入，请查看校验问题。'
      );
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.failed.set(true);
      this.status.set('导入失败：请检查文件内容后重试。');
      this.reason.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 使用用户确认的生效日期发布本次导入草稿。 */
  async publish(): Promise<void> {
    if (this.busy() || !this.ready() || this.resetting() || this.headerIds().length === 0) return;
    const epoch = this.service.dataEpoch();
    this.busy.set(true);
    this.status.set('');
    this.reason.set('');
    this.failed.set(false);
    const effectiveDate = this.publishDate();
    try {
      await this.service.publishImported(this.headerIds(), effectiveDate);
      if (epoch !== this.service.dataEpoch()) return;
      this.headerIds.set([]);
      this.status.set(
        `发布成功：所选结构已发布。新修订生效日期为 ${effectiveDate}；已有发布修订和发生项保留原生效日期，请按实际条件重新展开核对。`
      );
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.failed.set(true);
      this.status.set('发布失败：整批未发布，请检查草稿与生效日期后重试。');
      this.reason.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  async #recoverDrafts(epoch: number): Promise<void> {
    try {
      await this.service.refreshImportedDrafts();
    } catch (error) {
      if (epoch !== this.service.dataEpoch()) return;
      this.failed.set(true);
      this.status.set('草稿恢复失败，请重新打开面板或重试。');
      this.reason.set(String(error));
    }
  }
}
