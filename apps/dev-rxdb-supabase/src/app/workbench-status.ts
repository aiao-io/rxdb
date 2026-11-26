import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { DemoSession } from './demo-session';
import { PageWorkbench } from './page-workbench';
import { SyncCommands } from './sync-commands';

/**
 * 顶栏下面的一行结果：最近一轮推拉，以及经顶栏执行的撤销、重做失败的原因（US-230、US-231）
 *
 * @remarks
 * 推拉结果留到下一轮之前，可以先关掉；会话已在别的标签页换了身份时给「重新加载」。
 */
@Component({
  selector: 'app-workbench-status',
  imports: [LucideDynamicIcon],
  template: `
    @if ($result(); as result) {
      <div
        class="alert alert-soft rounded-none py-1 text-sm"
        [attr.role]="result.error ? 'alert' : 'status'"
        [class.alert-error]="result.error !== null"
        [class.alert-success]="result.error === null"
        data-testid="sync-result"
      >
        <span>{{ result.error ?? result.notice }}</span>
        <span class="flex items-center gap-1">
          @if (result.identityMismatch) {
            <button
              class="btn btn-xs"
              (click)="session.reload()"
              data-testid="sync-result-reload"
              type="button"
            >
              重新加载
            </button>
          }
          <button
            class="btn btn-ghost btn-xs btn-circle"
            (click)="dismiss()"
            aria-label="关掉这条结果"
            type="button"
          >
            <svg [lucideIcon]="X" size="14"></svg>
          </button>
        </span>
      </div>
    }
    @if (workbench.error(); as error) {
      <div class="alert alert-error alert-soft rounded-none py-1 text-sm" data-testid="workbench-error" role="alert">
        {{ error }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkbenchStatus {
  readonly #dismissedRound = signal<number | null>(null);
  readonly commands = inject(SyncCommands);
  readonly workbench = inject(PageWorkbench);
  readonly session = inject(DemoSession);
  readonly X = X;

  /** 最近一轮的结果；关掉之后到下一轮之前不再显示 */
  readonly $result = computed(() =>
    this.#dismissedRound() === this.commands.round() ? null : this.commands.result()
  );

  dismiss(): void {
    this.#dismissedRound.set(this.commands.round());
  }
}
