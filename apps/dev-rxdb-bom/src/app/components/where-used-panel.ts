import type { ExpansionResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../bom-demo.service';

/**
 * where-used 反查面板：从子件出发向上反查全部父件与路径（含虚拟件路径），默认反查 M3 螺钉。
 * overview（验收面板）与 where-used（反查页）两处复用；testid：where-used-line。
 */
@Component({
  selector: 'bom-where-used-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>查找使用这个物料的父件</h2>
        <p class="panel-desc">选择一个子件，查看哪些组件或整机使用它，以及相隔多少层。</p>
      </div>
      <div class="toolbar">
        <label>
          反查物料
          <select [(ngModel)]="selectedItem" [disabled]="busy() || !ready()" data-testid="where-used-select">
            @for (no of itemNos().values(); track no) {
              <option [value]="no">{{ no }}</option>
            }
          </select>
        </label>
        <button class="btn btn-primary" [disabled]="busy() || !ready()" (click)="runWhereUsed()">
          {{ busy() ? '处理中…' : '反查 ' + selectedItem() }}
        </button>
      </div>
      @if (!ready()) {
        <p class="hint">请先到概览装载示例数据，再选择要反查的物料。</p>
      }
      @if (busy()) {
        <p role="status">正在查找使用 {{ selectedItem() }} 的父件…</p>
      }
      @if (error()) {
        <div class="error-box" role="alert">反查未完成。请检查查询条件和数据，再重试。</div>
        <details class="details-panel">
          <summary>查看错误详情</summary>
          <pre>{{ error() }}</pre>
        </details>
      } @else if (result(); as result) {
        @if (result.truncated) {
          <p class="error-box" role="status">当前仅展示部分路径，请缩小查询范围后重试。</p>
        }
        @if (result.nodes.length > 0) {
          <p class="hint" role="status">
            {{ queried()?.item }} · {{ queried()?.date }}：找到 {{ result.nodes.length }} 条使用路径，涉及
            {{ parentCount() }} 个父件。
          </p>
          <div class="table-scroll">
            <table class="data-table" aria-label="物料使用路径">
              <thead>
                <tr>
                  <th scope="col">使用它的父件</th>
                  <th scope="col">层级</th>
                  <th scope="col">使用方式</th>
                  <th scope="col">路径记录</th>
                </tr>
              </thead>
              <tbody>
                @for (node of result.nodes; track node.path.join('>')) {
                  <tr data-testid="where-used-line">
                    <td>
                      <strong>{{ itemNo(node.itemId) }}</strong>
                    </td>
                    <td>{{ node.path.length }} 跳</td>
                    <td>
                      <span class="chip">{{ node.path.length === 1 ? '直接使用' : '经中间组件使用' }}</span>
                    </td>
                    <td>
                      <details class="details-panel">
                        <summary>查看完整路径</summary>
                        <code>{{ node.path.join(' → ') }}</code>
                      </details>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="empty-state" role="status">
            未找到使用 {{ queried()?.item }} 的父件。请更换物料或评估日后重试。
          </div>
        }
      } @else if (!busy()) {
        <div class="empty-state">选择物料和评估日，再点击「反查」查看使用它的父件。</div>
      }
    </section>
  `
})
export class WhereUsedPanel {
  private readonly service = inject(BomDemoService);

  readonly asOfDate = input.required<string>();
  readonly ready = this.service.ready;
  readonly itemNos = this.service.itemNos;
  readonly selectedItem = signal('M3');
  readonly result = signal<ExpansionResult | null>(null);
  readonly queried = signal<{ item: string; date: string } | null>(null);
  readonly error = signal('');
  readonly lines = computed(
    () =>
      this.result()?.nodes.map(
        node => `${node.path.length} 跳：${node.path.slice(0, 8).join(' → ')}（${this.itemNo(node.itemId)}）`
      ) ?? []
  );
  readonly parentCount = computed(() => new Set(this.result()?.nodes.map(node => node.itemId)).size);
  readonly busy = signal(false);

  constructor() {
    // 重置种子（ready 翻转为真）后清空反查结果（旧路径对新种子无意义）
    effect(() => {
      if (this.service.ready()) {
        this.result.set(null);
        this.queried.set(null);
        this.error.set('');
      }
    });
  }

  itemNo(itemId: string): string {
    return this.itemNos().get(itemId) ?? itemId.slice(0, 8);
  }

  /** 反查（AC#6：M3 螺钉的全部父件与路径，含虚拟件路径）。 */
  async runWhereUsed(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.result.set(null);
    const query = { item: this.selectedItem(), date: this.asOfDate() };
    this.queried.set(query);
    try {
      this.result.set(await this.service.whereUsed(query.date, this.itemIdOf(query.item)));
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** itemNo → itemId 反查（下拉选项来自 itemNos，反查必然命中；不命中即种子异常，直接抛出）。 */
  private itemIdOf(itemNo: string): string {
    for (const [id, no] of this.itemNos().entries()) {
      if (no === itemNo) return id;
    }
    throw new Error(`物料不在种子清单：${itemNo}`);
  }
}
