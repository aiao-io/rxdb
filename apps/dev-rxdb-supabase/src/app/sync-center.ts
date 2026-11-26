import { type HistoryItem, RxDB, RxDBBranch } from '@aiao/rxdb';
import { useFindAll, useSyncState } from '@aiao/rxdb-angular';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChangeDiff } from './change-diff';
import { DemoSession } from './demo-session';
import { entityLabelOf } from './entity-labels';
import { getErrorMessage } from './error-message';
import { describeHistoryItem, pageOfHistoryItem } from './history-describe';
import { PageWorkbench } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';
import { SyncCommands } from './sync-commands';
import { SyncRejectionsPanel } from './sync-rejections-panel';

/** 待推送清单里一个页面的那一组 */
interface PendingGroup {
  readonly page: string;
  readonly items: readonly HistoryItem[];
}

/**
 * 同步中心（US-230）：整机的推拉状态与会推什么
 *
 * @remarks
 * 像 git 的 `status` 加 `log @{u}..`：当前本地库与分支、在不在线、待推待拉，按实体分列的数字，
 * 推送会带上的每一项修改（一个事务一项，展开看改之前与改之后），最近一轮的结果与被拒的推送。
 * 按实体分列的数字各仓库各数各的，跨实体的事务在每个实体下各算一条；待推送清单才是按事务的准数。
 */
@Component({
  selector: 'app-sync-center',
  imports: [DatePipe, ChangeDiff, SyncRejectionsPanel],
  template: `
    <div class="flex flex-col gap-4 text-sm" data-testid="sync-center">
      <section class="flex flex-col gap-1" aria-label="当前本地库">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt class="text-base-content/60">身份</dt>
          <dd data-testid="sync-center-identity">
            {{ session.description ? session.description.title + ' · ' + session.description.detail : '本地模式' }}
          </dd>
          <dt class="text-base-content/60">本地库</dt>
          <dd>
            <code class="break-all">{{ session.prepared?.databaseName ?? '—' }}</code>
          </dd>
          <dt class="text-base-content/60">分支</dt>
          <dd data-testid="sync-center-branch">{{ $branch() ?? '—' }}</dd>
          <dt class="text-base-content/60">远端</dt>
          <dd data-testid="sync-center-online">
            @if (!remoteSync.$connected()) {
              未连接（纯本地模式）
            } @else {
              {{ syncState.online() ? '在线' : '离线' }}
            }
          </dd>
        </dl>
      </section>

      @if (remoteSync.$connected()) {
        <section class="flex flex-col gap-2" aria-labelledby="sync-center-counts-title">
          <h3 class="font-semibold" id="sync-center-counts-title">
            整机待推 ↑{{ commands.pushableCount() }} · 待拉 ↓{{ commands.pullableCount() }}
          </h3>
          <div class="flex gap-2">
            <button
              class="btn btn-sm"
              [disabled]="commands.pull.disabledReason() !== null"
              [title]="commands.pull.disabledReason() ?? '拉取本机全部同步中的数据'"
              (click)="workbench.run(commands.pull)"
              data-testid="sync-center-pull"
              type="button"
            >
              拉取
            </button>
            <button
              class="btn btn-sm btn-primary"
              [disabled]="commands.push.disabledReason() !== null"
              [title]="commands.push.disabledReason() ?? '推送本机全部没推的修改'"
              (click)="workbench.run(commands.push)"
              data-testid="sync-center-push"
              type="button"
            >
              推送
            </button>
          </div>
          @if ($repositories().length > 0) {
            <ul class="divide-base-200 divide-y" data-testid="sync-center-repositories">
              @for (row of $repositories(); track row.key) {
                <li
                  class="flex justify-between gap-2 py-1"
                  [attr.data-entity]="row.entity"
                  data-testid="sync-center-repository"
                >
                  <span
                    >{{ row.name }} <span class="text-base-content/60">· {{ row.page }}</span></span
                  >
                  <span class="text-base-content/70">待推 {{ row.pushable }} · 待拉 {{ row.pullable }}</span>
                </li>
              }
            </ul>
            <p class="text-base-content/60 text-xs">各实体各数各的：跨实体的一次写入在每个实体下各算一条。</p>
          } @else if ($statusError(); as error) {
            <p class="text-error" data-testid="sync-center-status-error" role="alert">
              查不到各实体的待推、待拉：{{ error }}
            </p>
          } @else if (repositoryStatuses.isLoading()) {
            <p class="text-base-content/60" data-testid="sync-center-loading">正在查各实体的待推、待拉…</p>
          } @else {
            <p class="text-base-content/60" data-testid="sync-center-clean">没有待推、待拉的实体。</p>
          }
        </section>

        <section class="flex flex-col gap-2" aria-labelledby="sync-center-pending-title">
          <h3 class="font-semibold" id="sync-center-pending-title">推送会带上 {{ $pending().length }} 项</h3>
          @for (group of $pendingGroups(); track group.page) {
            <div class="flex flex-col gap-1" [attr.data-page]="group.page" data-testid="sync-center-pending-group">
              <h4 class="text-base-content/70 text-xs font-semibold">{{ group.page }} · {{ group.items.length }}</h4>
              <ul class="flex flex-col gap-1">
                @for (item of group.items; track item.fingerprint) {
                  <li data-testid="pending-history">
                    <details class="border-base-200 rounded border px-2 py-1">
                      <summary class="flex cursor-pointer justify-between gap-2">
                        <span>{{ describe(item) }}</span>
                        <time class="text-base-content/60 text-xs">{{ item.createdAt | date: 'HH:mm:ss' }}</time>
                      </summary>
                      <div class="mt-2 flex flex-col gap-2">
                        @for (change of item.changes; track change.id) {
                          <app-change-diff [change]="change" />
                        }
                      </div>
                    </details>
                  </li>
                }
              </ul>
            </div>
          } @empty {
            <p class="text-base-content/60" data-testid="sync-center-pending-empty">本机没有待推送的修改。</p>
          }
        </section>
      }

      @if (commands.result(); as result) {
        <section class="flex flex-col gap-1" data-testid="sync-center-last-result">
          <h3 class="font-semibold">最近一次（{{ result.at | date: 'HH:mm:ss' }}）</h3>
          <p [class.text-error]="result.error !== null">{{ result.error ?? result.notice }}</p>
        </section>
      }

      <app-sync-rejections-panel />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncCenter {
  readonly #rxdb = inject(RxDB);
  readonly #branches = useFindAll(RxDBBranch, { where: { combinator: 'and', rules: [] } });
  readonly session = inject(DemoSession);
  readonly remoteSync = inject(RemoteSyncState);
  readonly commands = inject(SyncCommands);
  readonly workbench = inject(PageWorkbench);
  readonly syncState = useSyncState();

  /** 当前分支（只读）；切分支在侧栏 */
  readonly $branch = computed(() => this.#branches.value().find(branch => branch.activated)?.id ?? null);

  /** 有待推或待拉的实体：数字一变、每轮推拉结束都重查 */
  readonly repositoryStatuses = resource({
    params: () =>
      this.remoteSync.$connected() ?
        {
          pushable: this.commands.pushableCount(),
          pullable: this.commands.pullableCount(),
          round: this.commands.round()
        }
      : undefined,
    loader: () => this.#rxdb.syncManager.getAllRepositorySyncStatus({ hasPendingChanges: true })
  });

  /** 按实体查数失败的原因；查到或还在查时为 `null` */
  readonly $statusError = computed(() => {
    const error = this.repositoryStatuses.error();
    return error === undefined ? null : getErrorMessage(error, '未知错误');
  });

  readonly $repositories = computed(() =>
    (this.repositoryStatuses.hasValue() ? this.repositoryStatuses.value() : [])
      .filter(status => status.repository.namespace !== 'rxdb')
      .map(status => {
        const { name, page } = entityLabelOf(status.repository.entity);
        return {
          key: `${status.repository.namespace}:${status.repository.entity}`,
          entity: status.repository.entity,
          name,
          page,
          pushable: status.pushableCount,
          pullable: status.pullableCount
        };
      })
  );

  /** 推送会带上的修改（US-317）：一个事务一项，与 ↑N 同一口径 */
  readonly $pending = toSignal(this.#rxdb.versionManager.pushableHistories$, { initialValue: [] });

  /** 按页面分组，组内保持最新在前 */
  readonly $pendingGroups = computed(() =>
    this.$pending().reduce<PendingGroup[]>((groups, item) => {
      const page = pageOfHistoryItem(item);
      const group = groups.find(candidate => candidate.page === page);
      return group ?
          groups.map(candidate => (candidate === group ? { page, items: [...group.items, item] } : candidate))
        : [...groups, { page, items: [item] }];
    }, [])
  );

  readonly describe = describeHistoryItem;
}
