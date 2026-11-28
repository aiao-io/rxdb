import { RxDB } from '@aiao/rxdb';
import type { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { DemoSession } from '../demo-session';
import { getErrorMessage } from '../error-message';
import { describeHistoryEntry, type HistoryEntryView } from './catalog-history-view';

/** 打开历史要的商品字段 */
export interface HistoryTarget {
  readonly id: string;
  readonly name: string;
}

let nextHistoryId = 0;

/**
 * 一件商品的远端变更历史（US-229）：每次修改的时间、谁改的、从哪条路径改的、改之前与改之后。
 *
 * @remarks
 * 历史只经服务端的 `rxdb_entity_history` 读取，只对当前能编辑这件商品的成员开放（demo 里是所属租户的成员）；
 * 入口由面板只给这些人。原生 `<dialog>` 模态打开，内容只在打开时渲染。
 */
@Component({
  selector: 'app-catalog-item-history',
  template: `
    <dialog class="modal" #dialog [attr.aria-labelledby]="titleId" (close)="reset()">
      @if ($item(); as item) {
        <div class="modal-box flex flex-col gap-3">
          <h3 class="text-lg font-bold" [id]="titleId">变更历史 · {{ item.name }}</h3>
          <p class="text-base-content/60 text-sm">
            远端记下的每一次修改：谁改的、从哪条路径改的、改之前与改之后。只对能编辑这件商品的成员开放，
            本机还没推送的修改不在这里。
          </p>
          @if ($loading()) {
            <span class="loading loading-spinner loading-sm" aria-label="正在读取"></span>
          }
          @if ($error(); as error) {
            <div class="alert alert-error" role="alert">{{ error }}</div>
          }
          <ol class="flex flex-col gap-2" data-testid="history-entries">
            @for (entry of $entries(); track entry.id) {
              <li class="border-base-200 rounded border p-2" data-testid="history-entry">
                <div class="flex flex-wrap justify-between gap-2 text-sm">
                  <span class="font-medium">{{ entry.what }}</span>
                  <span class="text-base-content/60">{{ entry.time }} · {{ entry.who }}</span>
                </div>
                <ul class="text-sm">
                  @for (change of entry.changes; track change.label) {
                    <li>{{ change.label }}：{{ change.before }} → {{ change.after }}</li>
                  }
                </ul>
              </li>
            } @empty {
              @if (!$loading() && !$error()) {
                <li class="text-base-content/60 text-sm">还没有远端历史：本机的修改推送之后才会记下。</li>
              }
            }
          </ol>
          <div class="modal-action">
            <button class="btn" (click)="close()" type="button">关闭</button>
          </div>
        </div>
      }
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CatalogItemHistory {
  readonly #rxdb = inject(RxDB);
  readonly #session = inject(DemoSession);
  readonly #injector = inject(Injector);
  readonly #item = signal<HistoryTarget | null>(null);
  readonly #entries = signal<readonly HistoryEntryView[]>([]);
  readonly #loading = signal(false);
  readonly #error = signal<string | null>(null);
  readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly titleId = `catalog-item-history-title-${nextHistoryId++}`;

  /** 正在看的商品；没打开时为 `null` */
  readonly $item = this.#item.asReadonly();
  readonly $entries = this.#entries.asReadonly();
  readonly $loading = this.#loading.asReadonly();
  readonly $error = this.#error.asReadonly();

  /** 打开这件商品的历史，并向远端读一次 */
  async open(item: HistoryTarget): Promise<void> {
    this.#item.set(item);
    this.#entries.set([]);
    this.#error.set(null);
    afterNextRender(() => this.dialogRef().nativeElement.showModal(), { injector: this.#injector });
    this.#loading.set(true);
    try {
      const adapter = (await this.#rxdb.getAdapter('supabase')) as unknown as Pick<
        RxDBAdapterSupabase,
        'getEntityHistory'
      >;
      const me = this.#session.prepared?.session.subject ?? null;
      const history = await adapter.getEntityHistory(CatalogItem, item.id);
      // 读的过程中换了一件商品：这一轮的结果作废
      if (this.#item()?.id !== item.id) return;
      this.#entries.set(history.map(entry => describeHistoryEntry(entry, me)));
    } catch (error) {
      if (this.#item()?.id === item.id) this.#error.set(getErrorMessage(error, '读取变更历史失败'));
    } finally {
      if (this.#item()?.id === item.id) this.#loading.set(false);
    }
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  /** 关上之后撤掉内容 */
  reset(): void {
    this.#item.set(null);
    this.#entries.set([]);
  }
}
