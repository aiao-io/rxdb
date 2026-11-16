import type { MediaConfigCommitStatus } from '@aiao-media/domain';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

/**
 * 配置页对当前账号管理权限的判定。
 *
 * @remarks `unknown` 表示尚未确认：界面既不开放编辑，也不把空结果说成「没有配置」。
 */
export type AdminConfigPermission = 'unknown' | 'granted' | 'denied';

/** 配置提交在后台详情里展示所需的全部字段，时间均为 ISO 8601 字符串。 */
export interface AdminConfigCommitView {
  /** 提交 ID（UUID）。 */
  readonly id: string;
  /** 提交说明。 */
  readonly message: string;
  /** 所在配置分支。 */
  readonly branchId: string;
  /** 操作者 UUID。 */
  readonly authorId: string;
  /** 操作者名称；没有资料时为 `null`，界面改为显示 UUID。 */
  readonly authorLabel: string | null;
  /** 全部父提交 ID，按提交图顺序。 */
  readonly parentIds: readonly string[];
  /** 领域投影状态。 */
  readonly status: MediaConfigCommitStatus;
  /** 创建时间；本机尚未记录时为 `null`。 */
  readonly createdAt: string | null;
  /** 服务端应用时间；未应用为 `null`。 */
  readonly appliedAt: string | null;
  /** 公共目录发布时间；未发布为 `null`。 */
  readonly releasedAt: string | null;
  /** 服务端拒绝码；未拒绝为 `null`。 */
  readonly rejectionCode: string | null;
  /** 同步或应用时发现的冲突说明；没有冲突为 `null`。 */
  readonly conflictMessage: string | null;
}

/** 提交状态的业务文案。 */
export const ADMIN_CONFIG_COMMIT_STATUS_LABELS: Readonly<Record<MediaConfigCommitStatus, string>> = {
  prepared: '只在本机',
  synced: '已同步，待应用',
  validated: '已校验，待应用',
  applied: '已应用',
  released: '已发布',
  rejected: '已拒绝'
};

/**
 * 已知拒绝码与中文说明，与 `apply_media_config_commit` 拒绝应用的原因一一对应。
 *
 * @remarks 用 Map 而不是对象字面量，避免 `constructor` 之类的原型键被当成已知码。
 */
export const ADMIN_CONFIG_REJECTION_LABELS: ReadonlyMap<string, string> = new Map([
  ['revision_conflict', '配置版本冲突：目标配置已被其他提交修改'],
  ['parent_not_applied', '父提交缺失或尚未应用'],
  ['changes_incomplete', '提交的变更不完整'],
  ['fingerprint_mismatch', '提交内容指纹不一致'],
  ['record_exists', '要新增的配置已存在'],
  ['workspace_mismatch', '提交不属于当前工作区'],
  ['not_authorized', '当前账号无权应用该提交']
]);

/**
 * 把拒绝码翻成界面文案。
 *
 * @param code - 服务端写入的拒绝码
 * @returns 已知码的中文说明；未知码原样保留并标注为未识别
 */
export function describeAdminConfigRejection(code: string): string {
  return ADMIN_CONFIG_REJECTION_LABELS.get(code) ?? `未识别的拒绝码 ${code}`;
}

const timeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 按中文日期格式显示提交时间。
 *
 * @param iso - ISO 8601 时间
 * @throws Error 时间无法解析时，不把坏数据伪装成某个时间
 */
export function formatAdminConfigTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`提交时间格式无效：${iso}`);
  return timeFormat.format(date);
}

let nextHeadingId = 0;

/**
 * 配置页的加载、空列表、读取失败、离线、冲突与无权限状态。
 *
 * @remarks 纯展示：状态全部由输入给出。无权限时只渲染一条提示，不渲染任何可操作控件；
 * 进度类信息集中在一个礼貌播报的状态区域，失败与冲突用警示播报，每条都用文字写明状态。
 */
@Component({
  selector: 'app-admin-config-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (permission() === 'denied') {
      <p class="config-notice config-notice-error" role="alert">
        无权限：当前账号没有{{ entityLabel() }}的管理权限，内容与编辑入口已隐藏。
      </p>
    } @else {
      <div class="config-status" aria-live="polite" role="status">
        @for (line of statusLines(); track line) {
          <p>{{ line }}</p>
        }
      </div>
      @if (errorMessage(); as message) {
        <div class="config-notice config-notice-error" role="alert">
          <span>读取失败：{{ message }}</span>
          <button class="btn btn-sm" (click)="retry.emit()" type="button">重新读取</button>
        </div>
      }
      @if (conflictMessage(); as message) {
        <p class="config-notice config-notice-warning" role="alert">
          冲突：{{ message }}。本机修改不会被覆盖，请重新读取后核对双方修改再提交。
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .config-status p,
    .config-notice {
      margin: 0.35rem 0;
      font-size: 0.875rem;
    }
    .config-notice {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      border-left: 0.25rem solid currentColor;
      padding: 0.4rem 0.75rem;
    }
    .config-notice-error {
      color: var(--color-error);
    }
    .config-notice-warning {
      color: var(--color-warning-content);
      background: var(--color-warning);
    }
  `
})
export class AdminConfigStateComponent {
  /** 配置类别名称，例如「提示词模板」。 */
  readonly entityLabel = input.required<string>();
  /** 当前账号的配置管理权限。 */
  readonly permission = input.required<AdminConfigPermission>();
  /** 正在读取本地或远端配置。 */
  readonly loading = input(false);
  /** 读取完成且当前工作区没有记录。 */
  readonly empty = input(false);
  /** 浏览器处于离线状态。 */
  readonly offline = input(false);
  /** 读取失败的原因；没有失败为 `null`。 */
  readonly errorMessage = input<string | null>(null);
  /** 冲突说明；没有冲突为 `null`。 */
  readonly conflictMessage = input<string | null>(null);
  /** 同步状态的业务文案；没有同步信息为 `null`。 */
  readonly syncLabel = input<string | null>(null);
  /** 用户要求重新读取。 */
  readonly retry = output<void>();

  /** 只有确认有权限、读取结束且没有失败时，空结果才是「没有配置」。 */
  readonly showEmpty = computed(
    () => this.empty() && this.permission() === 'granted' && !this.loading() && !this.errorMessage()
  );

  /** 状态区域里按顺序播报的进度信息。 */
  readonly statusLines = computed(() => {
    const label = this.entityLabel();
    const sync = this.syncLabel();
    return [
      this.permission() === 'unknown' ? '正在确认配置管理权限…' : null,
      this.loading() ? `正在读取${label}…` : null,
      sync ? `同步状态：${sync}` : null,
      this.offline() ? '离线：修改只保存在本机，恢复网络后自动同步。' : null,
      this.showEmpty() ? `当前工作区还没有${label}。新增的内容先保存在本机，提交并应用后才会生效。` : null
    ].filter((line): line is string => line !== null);
  });
}

/**
 * 最近一次配置提交的状态、操作者、父提交、应用与发布结果，以及应用 / 安全回滚入口。
 *
 * @remarks 纯展示：动作只通过输出交给宿主，输出携带提交 ID，宿主可据此拒绝已过期的点击。
 * 回滚先在页内二次确认；忙碌或离线时动作禁用；没有管理能力时不渲染动作按钮。
 */
@Component({
  selector: 'app-admin-config-commit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="commit-card" [attr.aria-labelledby]="headingId">
      <header class="commit-header">
        <h3 [id]="headingId">最近提交</h3>
        <span class="commit-status" data-testid="commit-status">{{ statusLabel() }}</span>
      </header>
      <p class="commit-message">{{ commit().message }}</p>
      <dl class="commit-facts">
        <div>
          <dt>操作者</dt>
          <dd>{{ authorText() }}</dd>
        </div>
        <div>
          <dt>创建</dt>
          <dd>
            @if (commit().createdAt; as at) {
              <time [attr.datetime]="at">{{ format(at) }}</time>
            } @else {
              未记录
            }
          </dd>
        </div>
        <div>
          <dt>应用</dt>
          <dd>
            @if (commit().appliedAt; as at) {
              <time [attr.datetime]="at">{{ format(at) }}</time>
            } @else {
              未应用
            }
          </dd>
        </div>
        <div>
          <dt>发布</dt>
          <dd>
            @if (commit().releasedAt; as at) {
              <time [attr.datetime]="at">{{ format(at) }}</time>
            } @else {
              未发布
            }
          </dd>
        </div>
        @if (commit().rejectionCode; as code) {
          <div class="commit-error">
            <dt>拒绝原因</dt>
            <dd>{{ describe(code) }}</dd>
          </div>
        }
      </dl>
      @if (commit().conflictMessage; as message) {
        <p class="commit-error" role="alert">冲突：{{ message }}</p>
      }
      @if (canManage()) {
        <div class="commit-actions">
          @if (canApply()) {
            <button
              class="btn btn-primary btn-sm"
              [disabled]="disabled()"
              (click)="apply.emit(commit().id)"
              type="button"
            >
              应用提交
            </button>
          }
          @if (canRollback()) {
            <button class="btn btn-outline btn-sm" [disabled]="disabled()" (click)="confirming.set(true)" type="button">
              执行安全回滚
            </button>
          }
        </div>
        @if (confirming() && canRollback()) {
          <div class="rollback-confirm" aria-label="确认安全回滚" role="group">
            <p>确认回滚「{{ commit().message }}」？回滚按逆向变更恢复上一版配置，并留下审计记录。</p>
            <button class="btn btn-error btn-sm" [disabled]="disabled()" (click)="confirmRollback()" type="button">
              确认回滚
            </button>
            <button class="btn btn-ghost btn-sm" (click)="confirming.set(false)" type="button">取消</button>
          </div>
        }
        @if (offline()) {
          <p>离线时不能应用或回滚。</p>
        }
      }
      <details>
        <summary>技术详情</summary>
        <p>分支：{{ commit().branchId }}</p>
        <p>
          提交 ID：<code>{{ commit().id }}</code>
        </p>
        @if (commit().parentIds.length) {
          <p>父提交：</p>
          <ul>
            @for (parent of commit().parentIds; track parent) {
              <li data-testid="commit-parent">
                <code>{{ parent }}</code>
              </li>
            }
          </ul>
        } @else {
          <p>父提交：无父提交</p>
        }
      </details>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .commit-card {
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      padding: 1rem;
      background: var(--color-base-100);
    }
    .commit-header,
    .commit-actions,
    .rollback-confirm {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    h3 {
      margin: 0;
      font-size: 1rem;
    }
    p {
      margin: 0.3rem 0;
      overflow-wrap: anywhere;
    }
    .commit-facts {
      display: grid;
      gap: 0.25rem;
      margin: 0.5rem 0;
    }
    .commit-facts div {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .commit-status {
      border-radius: 999px;
      background: var(--color-base-200);
      padding: 0.15rem 0.5rem;
    }
    .commit-error {
      color: var(--color-error);
    }
    .rollback-confirm {
      margin-top: 0.5rem;
      border-left: 0.25rem solid var(--color-error);
      padding-left: 0.75rem;
    }
    code {
      overflow-wrap: anywhere;
    }
  `
})
export class AdminConfigCommitComponent {
  /** 要展示的提交。 */
  readonly commit = input.required<AdminConfigCommitView>();
  /** 当前账号能否应用或回滚配置；为 `false` 时不渲染动作按钮。 */
  readonly canManage = input.required<boolean>();
  /** 有进行中的应用或回滚请求。 */
  readonly busy = input(false);
  /** 浏览器处于离线状态。 */
  readonly offline = input(false);
  /** 请求应用提交，携带提交 ID。 */
  readonly apply = output<string>();
  /** 确认后请求安全回滚，携带提交 ID。 */
  readonly rollback = output<string>();

  /** 卡片标题的元素 ID。 */
  readonly headingId = `admin-config-commit-${++nextHeadingId}`;
  /** 回滚确认是否展开；换成另一个提交时自动收起。 */
  readonly confirming = linkedSignal({ source: () => this.commit().id, computation: () => false });
  /** 状态的业务文案。 */
  readonly statusLabel = computed(() => ADMIN_CONFIG_COMMIT_STATUS_LABELS[this.commit().status]);
  /** 操作者名称，没有资料时为 UUID。 */
  readonly authorText = computed(() => this.commit().authorLabel ?? this.commit().authorId);
  /** 已同步或已校验的提交可以应用。 */
  readonly canApply = computed(() => ['synced', 'validated'].includes(this.commit().status));
  /** 已应用或已发布的提交可以安全回滚。 */
  readonly canRollback = computed(() => ['applied', 'released'].includes(this.commit().status));
  /** 忙碌或离线时禁用动作。 */
  readonly disabled = computed(() => this.busy() || this.offline());

  /** 模板用的时间格式化。 */
  readonly format = formatAdminConfigTime;
  /** 模板用的拒绝码翻译。 */
  readonly describe = describeAdminConfigRejection;

  /** 确认回滚：先收起确认，再把提交 ID 交给宿主。 */
  confirmRollback(): void {
    this.confirming.set(false);
    this.rollback.emit(this.commit().id);
  }
}
