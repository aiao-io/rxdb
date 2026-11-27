import { useSyncState } from '@aiao/rxdb-angular';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideArrowDown as ArrowDown,
  LucideArrowUp as ArrowUp,
  LucideArrowUpDown as ArrowUpDown,
  LucideChevronDown as ChevronDown,
  LucideHistory as History,
  LucideDynamicIcon,
  LucideMenu as Menu,
  LucideRedo2 as Redo2,
  LucideUndo2 as Undo2
} from '@lucide/angular';
import { AppService } from './app.service';
import { IDENTITY_CHOICES } from './demo-identity';
import { DemoSession } from './demo-session';
import { HISTORY_COLUMN_TOGGLE_ID, HistoryColumn } from './history-column';
import { PageWorkbench, type WorkbenchAction } from './page-workbench';
import { RemoteSecurityNotice } from './remote-security-notice';
import { RightPanel, type RightPanelView } from './side-panel';
import { SyncCommands } from './sync-commands';

/**
 * 顶栏：页面登记的撤销、重做与操作历史，整机的拉取、推送与同步中心，安全提示与切换身份（epic-016）
 *
 * @remarks
 * 顶栏不认识任何页面，只按 {@link PageWorkbench} 当前的登记渲染：没登记的按钮不显示（首页什么都不登记）。
 * 撤销、重做写明作用域（「本页：商品」），推送、拉取写明「整机」——两种作用域并排，范围写在控件上。
 * 不能点的按钮用 `aria-disabled` 而不是 `disabled`：原因写在 `title` 里，悬停与读屏都读得到。
 * 切换身份会登录或退出，然后重新加载页面，打开那个身份自己的本地库（US-035）。
 */
@Component({
  selector: 'app-header',
  imports: [LucideDynamicIcon, RemoteSecurityNotice],
  template: `<div
    class="bg-base-100 border-base-300 flex flex-wrap items-center justify-between gap-2 border-b p-1"
    id="layout-topbar"
    aria-label="顶栏"
    role="navigation"
  >
    <div class="flex min-w-0 items-center gap-2">
      <!-- 窄屏上侧栏收起成抽屉，从这里打开；宽屏侧栏常驻，不需要 -->
      <button class="btn btn-ghost btn-sm md:hidden" (click)="app.toggleSidebar()" aria-label="菜单" type="button">
        <svg [lucideIcon]="Menu" size="20"></svg>
      </button>
      @if (workbench.current(); as page) {
        <!-- 操作历史在左侧一栏，开关也在最左边，与那一栏上下对齐 -->
        @if (page.history) {
          <button
            class="btn btn-sm btn-ghost"
            [attr.aria-expanded]="historyColumn.open()"
            [class.btn-active]="historyColumn.open()"
            [id]="historyToggleId"
            (click)="historyColumn.toggle()"
            aria-controls="history-column"
            aria-label="操作历史"
            data-testid="workbench-history-toggle"
            title="本页的操作历史"
            type="button"
          >
            <svg [lucideIcon]="History" size="16"></svg>
          </button>
        }
        <span class="truncate font-semibold max-md:hidden" data-testid="workbench-title">{{ page.title }}</span>
        @if (page.undo || page.redo) {
          <div
            class="flex items-center gap-1"
            [attr.aria-label]="'撤销与重做，' + page.scopeLabel"
            data-testid="workbench-edit-group"
            role="group"
          >
            @if (page.undo; as undo) {
              <button
                class="btn btn-sm btn-ghost"
                [attr.aria-disabled]="unavailable(undo)"
                [class.opacity-50]="unavailable(undo)"
                [title]="undo.disabledReason() ?? '撤销本页上一次修改（⌘/Ctrl+Z）'"
                (click)="workbench.run(undo)"
                aria-keyshortcuts="Control+Z Meta+Z"
                aria-label="撤销"
                data-testid="workbench-undo"
                type="button"
              >
                <svg [lucideIcon]="Undo2" size="16"></svg>
                <span class="max-lg:hidden">撤销</span>
                @if (undo.count()) {
                  <span class="badge badge-xs" data-testid="workbench-undo-count">{{ undo.count() }}</span>
                }
              </button>
            }
            @if (page.redo; as redo) {
              <button
                class="btn btn-sm btn-ghost"
                [attr.aria-disabled]="unavailable(redo)"
                [class.opacity-50]="unavailable(redo)"
                [title]="redo.disabledReason() ?? '重做（⌘/Ctrl+Shift+Z）'"
                (click)="workbench.run(redo)"
                aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
                aria-label="重做"
                data-testid="workbench-redo"
                type="button"
              >
                <svg [lucideIcon]="Redo2" size="16"></svg>
                <span class="max-lg:hidden">重做</span>
                @if (redo.count()) {
                  <span class="badge badge-xs" data-testid="workbench-redo-count">{{ redo.count() }}</span>
                }
              </button>
            }
            <span class="text-base-content/60 text-xs max-xl:hidden" data-testid="workbench-scope">
              {{ page.scopeLabel }}
            </span>
          </div>
        }
      }
    </div>

    <div class="ms-auto flex items-center gap-2">
      @if (workbench.current(); as page) {
        @if (page.pull || page.push) {
          <div
            class="flex items-center gap-1"
            [attr.data-sync-round]="commands.round()"
            aria-label="整机同步"
            data-testid="workbench-sync-group"
            role="group"
          >
            <span class="text-base-content/60 text-xs max-xl:hidden">整机</span>
            @if (page.pull; as pull) {
              <button
                class="btn btn-sm"
                [attr.aria-disabled]="unavailable(pull)"
                [class.opacity-50]="unavailable(pull)"
                [title]="pull.disabledReason() ?? '拉取本机全部同步中的数据'"
                (click)="workbench.run(pull)"
                aria-label="拉取"
                data-testid="sync-pull"
                type="button"
              >
                @if (pull.pending()) {
                  <span class="loading loading-spinner loading-xs"></span>
                } @else {
                  <svg [lucideIcon]="ArrowDown" size="16"></svg>
                }
                <span class="max-sm:hidden">拉取</span>
                @if (pull.count()) {
                  <span class="badge badge-xs badge-primary" data-testid="sync-pullable-count">{{ pull.count() }}</span>
                }
              </button>
            }
            @if (page.push; as push) {
              <button
                class="btn btn-sm"
                [attr.aria-disabled]="unavailable(push)"
                [class.opacity-50]="unavailable(push)"
                [title]="push.disabledReason() ?? '推送本机全部没推的修改'"
                (click)="workbench.run(push)"
                aria-label="推送"
                data-testid="sync-push"
                type="button"
              >
                @if (push.pending()) {
                  <span class="loading loading-spinner loading-xs"></span>
                } @else {
                  <svg [lucideIcon]="ArrowUp" size="16"></svg>
                }
                <span class="max-sm:hidden">推送</span>
                @if (push.count()) {
                  <span class="badge badge-xs badge-primary" data-testid="sync-pushable-count">{{ push.count() }}</span>
                }
              </button>
            }
            <button
              class="btn btn-sm btn-ghost relative"
              #syncToggle
              [attr.aria-expanded]="panel.active() === 'sync'"
              [class.btn-active]="panel.active() === 'sync'"
              (click)="toggle('sync', syncToggle)"
              aria-controls="side-panel"
              aria-label="同步中心"
              data-testid="sync-center-toggle"
              title="同步中心：待推待拉、会推什么、被拒的推送"
              type="button"
            >
              <svg [lucideIcon]="ArrowUpDown" size="16"></svg>
              @if (syncState.lastRejections().length > 0) {
                <span class="badge badge-error badge-xs absolute -top-1 -right-1" data-testid="sync-center-rejections">
                  {{ syncState.lastRejections().length }}
                </span>
              }
            </button>
          </div>
        }
      }
      <app-remote-security-notice />
      @if (session.description; as description) {
        <!-- 身份名与说明不在顶栏上占地方：下拉框里就是当前身份，说明在悬停提示与读屏描述里，同步中心也写着 -->
        <span class="sr-only" id="identity-description">
          当前身份：<span data-testid="identity-title">{{ description.title }}</span> · {{ description.detail }}
        </span>
        <!-- 选中项绑在每个 option 上：select 的 [value] 先于 @for 渲染出选项，会落回第一项 -->
        <select
          class="select select-sm w-36 max-sm:w-28"
          [disabled]="session.$switching()"
          [title]="description.title + ' · ' + description.detail"
          (change)="switchTo($event)"
          aria-describedby="identity-description"
          aria-label="切换身份"
        >
          @if (session.currentChoice === null) {
            <option disabled selected value="">其他账号</option>
          }
          @for (choice of choices; track choice.key) {
            <option [selected]="choice.key === session.currentChoice" [value]="choice.key">{{ choice.label }}</option>
          }
        </select>
      } @else {
        <details class="dropdown dropdown-end pointer-events-auto" data-testid="local-mode-notice">
          <summary class="btn btn-sm btn-ghost">
            本地模式
            <svg [lucideIcon]="ChevronDown" aria-hidden="true" size="14"></svg>
          </summary>
          <div
            class="dropdown-content bg-base-100 border-base-300 rounded-box mt-2 w-[min(22rem,calc(100vw-2rem))] border p-3 text-sm shadow-xl"
          >
            <p>推送、拉取和身份切换需要连接 Supabase。</p>
            <p class="mt-2">停止当前服务后，运行以下命令启动远端模式。</p>
            <code class="bg-base-200 mt-1 block rounded px-2 py-1 text-xs select-all"
              >pnpm nx dev dev-rxdb-supabase</code
            >
          </div>
        </details>
      }
    </div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  readonly app = inject(AppService);
  readonly session = inject(DemoSession);
  readonly workbench = inject(PageWorkbench);
  readonly commands = inject(SyncCommands);
  readonly panel = inject(RightPanel);
  readonly historyColumn = inject(HistoryColumn);
  readonly historyToggleId = HISTORY_COLUMN_TOGGLE_ID;
  readonly syncState = useSyncState();
  readonly choices = IDENTITY_CHOICES;
  readonly Menu = Menu;
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly History = History;
  readonly ArrowDown = ArrowDown;
  readonly ArrowUp = ArrowUp;
  readonly ArrowUpDown = ArrowUpDown;
  readonly ChevronDown = ChevronDown;

  /** 现在点不了：有不可用的原因，或正在执行 */
  unavailable(action: WorkbenchAction): boolean {
    return action.disabledReason() !== null || action.pending();
  }

  toggle(view: RightPanelView, opener: HTMLElement): void {
    this.panel.toggle(view, opener);
  }

  switchTo(event: Event): void {
    void this.session.switchTo((event.target as HTMLSelectElement).value);
  }
}
