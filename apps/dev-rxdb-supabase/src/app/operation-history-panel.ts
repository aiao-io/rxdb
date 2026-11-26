import { type HistoryItem, RxDB } from '@aiao/rxdb';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap } from 'rxjs';
import { ChangeDiff } from './change-diff';
import { describeHistoryItem } from './history-describe';
import { PageWorkbench } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';

/** 一个历史项身上的标记 */
type HistoryChip = 'pending' | 'reverted' | 'invalidated' | 'rejected';

const CHIP_LABELS: Readonly<Record<HistoryChip, string>> = {
  pending: '↑ 待推送',
  reverted: '已撤销',
  invalidated: '已失效',
  rejected: '被拒'
};

/**
 * 操作历史（US-231）：当前页面作用域、本次会话做过的修改
 *
 * @remarks
 * 「我这次做了什么」的视图，不是待推送清单：数据是页面登记的 `history(scope).histories$`，只含本次会话的变更。
 * 还在待推送集合里的项标 ↑（US-230 阶段 C），推送之后标记消失；另有已撤销、已失效（重做作废）与被拒三种标记。
 */
@Component({
  selector: 'app-operation-history-panel',
  imports: [DatePipe, ChangeDiff],
  template: `
    <div class="flex flex-col gap-3 text-sm" data-testid="operation-history-panel">
      @if (workbench.current(); as page) {
        <p class="text-base-content/70" data-testid="operation-history-scope">
          {{ page.scopeLabel }} · 可撤销 {{ page.undo?.count() ?? 0 }} · 可重做 {{ page.redo?.count() ?? 0 }}
        </p>
        <ol class="flex flex-col gap-1">
          @for (item of $histories(); track item.fingerprint) {
            <li [attr.data-type]="item.type" data-testid="operation-history-item">
              <details class="border-base-200 rounded border px-2 py-1" [class.opacity-60]="item.reverted">
                <summary class="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span [class.line-through]="item.redoInvalidated">{{ describe(item) }}</span>
                  <span class="flex items-center gap-1">
                    @for (chip of chipsOf(item); track chip) {
                      <span class="badge badge-xs badge-soft" [attr.data-chip]="chip" data-testid="history-chip">
                        {{ chipLabels[chip] }}
                      </span>
                    }
                    <time class="text-base-content/60 text-xs">{{ item.createdAt | date: 'HH:mm:ss' }}</time>
                  </span>
                </summary>
                <div class="mt-2 flex flex-col gap-2">
                  @for (change of item.changes; track change.id) {
                    <app-change-diff [change]="change" />
                  }
                </div>
              </details>
            </li>
          } @empty {
            <li class="text-base-content/60" data-testid="operation-history-empty">这次打开之后，本页还没有修改。</li>
          }
        </ol>
      } @else {
        <p class="text-base-content/60">当前页面没有操作历史。</p>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperationHistoryPanel {
  readonly #rxdb = inject(RxDB);
  readonly #remoteSync = inject(RemoteSyncState);
  readonly workbench = inject(PageWorkbench);
  readonly chipLabels = CHIP_LABELS;
  readonly describe = describeHistoryItem;

  /** 当前页面作用域的历史：换了页面就换一份 */
  readonly $histories = toSignal(
    toObservable(computed(() => this.workbench.current()?.history ?? null)).pipe(
      switchMap(scope => (scope ? scope.histories$ : of<HistoryItem[]>([])))
    ),
    { initialValue: [] }
  );

  /** 还在待推送集合里的变更 id；本地模式没有推送，不标 */
  readonly #pendingIds = toSignal(
    this.#rxdb.versionManager.pushableHistories$.pipe(
      map(items => new Set(items.flatMap(item => item.changes.map(change => change.id))))
    ),
    { initialValue: new Set<number>() }
  );

  chipsOf(item: HistoryItem): HistoryChip[] {
    const pending = this.#remoteSync.$connected() && item.changes.some(change => this.#pendingIds().has(change.id));
    const chips: [HistoryChip, boolean][] = [
      ['pending', pending && !item.reverted],
      ['reverted', item.reverted && !item.redoInvalidated],
      ['invalidated', item.redoInvalidated],
      ['rejected', item.changes.some(change => change.rejectedAt !== null && change.rejectedAt !== undefined)]
    ];
    return chips.filter(([, shown]) => shown).map(([chip]) => chip);
  }
}
