import { RxDB } from '@aiao/rxdb';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { I18nPipe } from '../../pipes/i18n.pipe';
import { describeSnapshot, grantPreset, seedScopedRows, type GrantDemoTarget, type GrantPreset } from './grant-demo';

/**
 * 授权快照演示面板（US-029）：出在演示实体 `TenantNote` 的列表上方
 *
 * 状态文字随 `rxdb.grants.snapshot$` 变化；三个按钮见 `grant-demo.ts`。
 */
@Component({
  selector: 'app-grant-demo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [I18nPipe],
  host: { class: 'block shrink-0' },
  template: `
    <section
      class="border-base-300 bg-base-200 flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
      [attr.aria-label]="'page.entity.grantDemo.title' | i18n"
      data-testid="grant-demo"
    >
      <span class="font-medium">{{ 'page.entity.grantDemo.title' | i18n }}</span>
      @let current = status();
      <span class="text-base-content/70 font-mono" data-testid="grant-demo-status">
        @if (current.kind === 'message') {
          {{ current.key | i18n }}
        } @else {
          {{ current.text }}
        }
      </span>
      <span class="flex-1"></span>
      <button class="btn btn-xs" (click)="seed()" type="button">{{ 'page.entity.grantDemo.seed' | i18n }}</button>
      <button class="btn btn-xs" (click)="apply('a-editable')" type="button">
        {{ 'page.entity.grantDemo.grantA' | i18n }}
      </button>
      <button class="btn btn-xs" (click)="apply('a-revoked')" type="button">
        {{ 'page.entity.grantDemo.revokeA' | i18n }}
      </button>
    </section>
  `
})
export class GrantDemoPanelComponent {
  readonly #rxdb = inject(RxDB);
  readonly #snapshot = toSignal(this.#rxdb.grants.snapshot$, { initialValue: this.#rxdb.grants.snapshot });

  /** 声明了 `access.scope` 的实体与它的作用域 */
  readonly target = input.required<GrantDemoTarget>();

  /** 当前快照的状态文字 */
  readonly status = computed(() => describeSnapshot(this.#snapshot()));

  /** 经本地适配器落 a、b 各一行（系统写） */
  seed(): Promise<void> {
    return seedScopedRows(this.#rxdb, this.target());
  }

  /** 设入一组演示授权 */
  apply(preset: GrantPreset): Promise<void> {
    return this.#rxdb.grants.set(grantPreset(preset, this.target().scope));
  }
}
