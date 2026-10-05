import type { SyncRejection } from '@aiao/rxdb';
import { useSyncState } from '@aiao/rxdb-angular';
import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * 被拒原因的展示文案。
 *
 * @remarks
 * 与 React `SyncRejectionsPanel.tsx`、Vue `SyncRejectionsPanel.vue` 同一份文案（US-218 AC#16）。
 */
const REASON_LABELS: Readonly<Record<SyncRejection['reason'], string>> = {
  denied: '无权限',
  gone: '已被删除',
  dependency: '依赖未满足'
};

/**
 * 最近一轮推送里被远端拒绝的变更（US-218 AC#16）。
 *
 * @remarks
 * 只有「空态 / 有数据」两态：数据是同步快照，无加载态；提交失败不上报，无错误态。
 * 列表不被后续成功清空，下一轮有被拒时整体替换（`SyncState.lastRejections` 的语义）。
 */
@Component({
  selector: 'app-sync-rejections-panel',
  template: `
    <section
      class="mx-auto mb-3 max-w-4xl px-4"
      aria-labelledby="sync-rejections-title"
      data-testid="sync-rejections-panel"
    >
      <h2 class="text-sm font-semibold" id="sync-rejections-title">被拒的推送</h2>
      @if (sync.lastRejections().length === 0) {
        <p class="text-base-content/70 text-sm">最近没有被远端拒绝的推送</p>
      } @else {
        <ul class="divide-base-200 divide-y text-sm">
          @for (rejection of sync.lastRejections(); track rejection.namespace + rejection.entity + rejection.entityId) {
            <li class="flex flex-wrap gap-2 py-1">
              <span class="font-medium">{{ rejection.entity }}</span>
              <span>{{ rejection.op }}</span>
              <span>{{ reasonLabels[rejection.reason] }}（{{ rejection.code }}）</span>
              <span class="break-all">{{ rejection.message }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncRejectionsPanel {
  readonly sync = useSyncState();
  readonly reasonLabels = REASON_LABELS;
}
