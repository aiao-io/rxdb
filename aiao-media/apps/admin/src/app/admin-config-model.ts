import {
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  type MediaConfigCommitEnvelope,
  type MediaConfigCommitStatus
} from '@aiao-media/domain';
import { RxDBBranch, type EntityType, type RxDB, type UUID } from '@aiao/rxdb';
import type { MergePreview } from '@aiao/rxdb-plugin-history';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounceTime, firstValueFrom, Subject, type Subscription } from 'rxjs';
import { createAdminSupabaseSyncClient } from './admin-auth';
import {
  describeAdminConfigMerge,
  mergeAdminConfigConflictCount,
  normalizeAdminConfigBranchId,
  type AdminConfigBranchView,
  toAdminConfigBranchView
} from './admin-config-branches';
import {
  createAdminConfigProjection,
  createAdminConfigProjectionStore,
  isConfigContentUnit,
  type AdminConfigProjection
} from './admin-config-projection';
import {
  AdminConfigCommitComponent,
  AdminConfigStateComponent,
  type AdminConfigCommitView,
  type AdminConfigPermission
} from './admin-config-status';
import { AdminConfigDatabaseHost, normalizeAdminUserId } from './admin-rxdb';
import { ProductRequestError, type ProductClient, type RemoteConfigCommitStatus } from './product-client';

type ConfigName = 'MediaPromptTemplate' | 'MediaProviderPolicy';

interface ContentRow {
  kind: 'template' | 'provider-policy';
  key: string;
  revision: number;
  payload: unknown;
}

interface ContentPage {
  drafts: ContentRow[];
}

interface AppliedRevision {
  entity: string;
  entityId: string;
  revision: number;
}

const CONFIG_TYPES: Readonly<Record<string, EntityType>> = {
  MediaPromptTemplate,
  MediaProviderPolicy,
  MediaPlatformModel
};
const SYNC_INTERVAL_MS = 30_000;
const COMMIT_MESSAGE_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rowPayload(row: ContentRow): Record<string, unknown> {
  if (!isRecord(row.payload)) throw new Error('配置草稿格式无效。');
  return row.payload;
}

/** 读取应用 / 回滚回执里逐实体的服务端 revision。 */
export function parseAppliedRevisions(receipt: unknown): AppliedRevision[] {
  if (!isRecord(receipt) || !Array.isArray(receipt['revisions'])) throw new Error('配置应用回执无效。');
  return receipt['revisions'].map(item => {
    if (
      !isRecord(item) ||
      typeof item['entity'] !== 'string' ||
      typeof item['entityId'] !== 'string' ||
      !Number.isSafeInteger(item['revision'])
    )
      throw new Error('配置应用回执无效。');
    return { entity: item['entity'], entityId: item['entityId'], revision: item['revision'] as number };
  });
}

/** 为配置实体列表固定当前工作区，避免账号切换后读取其他工作区的本地记录。 */
export function createAdminConfigWorkspaceQuery(
  workspaceId: string | null
): { combinator: 'and'; rules: [{ field: 'workspaceId'; operator: '='; value: string }] } | undefined {
  if (!workspaceId) return undefined;
  return { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] };
}

/** 新建配置时由系统决定的字段：工作区、分支、修订号与删除时间不交给管理员手填。 */
export function createAdminConfigFixedFormData(workspaceId: string | null): Record<string, unknown> | undefined {
  if (!workspaceId) return undefined;
  return { workspaceId, branchId: 'main', revision: 1, deletedAt: null };
}

/** 把服务端提交状态转成提交详情组件的视图模型。 */
export function toAdminConfigCommitView(
  commit: RemoteConfigCommitStatus,
  conflictMessage: string | null
): AdminConfigCommitView {
  return {
    id: commit.id,
    message: commit.message,
    branchId: commit.branchId,
    authorId: commit.authorId,
    authorLabel: null,
    parentIds: commit.parentIds,
    status: commit.status,
    createdAt: commit.createdAt,
    appliedAt: commit.appliedAt,
    releasedAt: commit.releasedAt,
    rejectionCode: commit.rejectionCode,
    conflictMessage
  };
}

/**
 * Admin 配置页面：本机 RxDB 是唯一的显示与编辑状态，经变更日志按工作区同步；
 * 本机修改经工作树提交后生成领域投影，由服务端 RPC 应用。
 */
@Component({
  selector: 'app-admin-config-model',
  imports: [EntityListComponent, FormsModule, AdminConfigStateComponent, AdminConfigCommitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="model-config" [attr.aria-busy]="loading()" [attr.data-testid]="'model-config-' + name()">
      <header class="model-config-header">
        <p class="section-kicker">内容管理</p>
        <h2>{{ title() }}</h2>
        <p>修改先保存在本机并同步到你的工作区草稿；提交后可应用到服务端配置，对用户生效前请核对状态。</p>
      </header>
      <app-admin-config-state
        [conflictMessage]="conflict()"
        [empty]="empty()"
        [entityLabel]="title()"
        [errorMessage]="message()"
        [loading]="loading()"
        [offline]="offline()"
        [permission]="permission()"
        [syncLabel]="syncLabel()"
        (retry)="retry()"
      />
      @if (permission() === 'granted') {
        @if (databaseReady()) {
          <section class="branch-panel" aria-labelledby="config-branch-title">
            <header class="branch-panel-header">
              <div>
                <p class="section-kicker">版本管理</p>
                <h3 id="config-branch-title">配置分支</h3>
              </div>
              <span class="branch-current" data-testid="config-active-branch">当前：{{ activeBranchId() ?? '未知' }}</span>
            </header>
            <div class="branch-controls">
              <label>
                切换分支
                <select
                  aria-label="切换配置分支"
                  [ngModel]="activeBranchId()"
                  (ngModelChange)="switchBranch($event)"
                  name="activeBranch"
                  [disabled]="loading() || !workingTreeClean()"
                >
                  @for (branch of localBranches(); track branch.id) {
                    <option [value]="branch.id">{{ branch.id }}{{ branch.activated ? '（当前）' : '' }}</option>
                  }
                </select>
              </label>
              <form (ngSubmit)="createBranch()" aria-label="创建配置分支">
                <label>
                  新分支
                  <input
                    class="input input-sm"
                    [ngModel]="branchName()"
                    (ngModelChange)="branchName.set($event)"
                    name="branchName"
                    maxlength="128"
                    placeholder="例如 release/2026-11"
                  />
                </label>
                <button class="btn btn-outline btn-sm" [disabled]="loading() || !workingTreeClean()" type="submit">
                  创建并切换
                </button>
              </form>
            </div>
            @if (!workingTreeClean()) {
              <p class="branch-hint">当前分支有未提交修改，先提交或丢弃后才能切换和合并。</p>
            }
            @if (branchError(); as failure) {
              <p class="operation-error" role="alert">{{ failure }}</p>
            }
            <div class="branch-merge-list">
              @for (branch of mergeCandidates(); track branch.id) {
                <button
                  class="btn btn-ghost btn-sm"
                  [disabled]="loading() || !workingTreeClean()"
                  (click)="previewMerge(branch.id)"
                  type="button"
                >
                  预览 {{ branch.id }} → {{ activeBranchId() }}
                </button>
              }
            </div>
            @if (mergePreview(); as preview) {
              <div class="merge-preview" data-testid="config-merge-preview">
                <p>{{ mergeDescription() }}</p>
                @if (mergeConflicts().length) {
                  <ul>
                    @for (entry of mergeConflicts(); track entry.entity + ':' + entry.entityId) {
                      <li>{{ entry.entity }} / {{ entry.entityId }}：{{ entry.conflict?.kind }}</li>
                    }
                  </ul>
                }
                <button
                  class="btn btn-primary btn-sm"
                  [disabled]="loading() || mergeConflictCount() > 0 || !workingTreeClean()"
                  (click)="mergePreviewBranch()"
                  type="button"
                >
                  合并到当前分支
                </button>
                <button class="btn btn-ghost btn-sm" [disabled]="loading()" (click)="clearMergePreview()" type="button">
                  关闭预览
                </button>
              </div>
            }
          </section>
        }
        @if (pendingChanges() > 0) {
          <form class="commit-form" (ngSubmit)="commitChanges()" aria-label="提交本机修改">
            <p>本机有 {{ pendingChanges() }} 项未提交的修改。</p>
            <label>
              提交说明
              <input
                class="input input-sm"
                [attr.maxlength]="commitMessageLimit"
                [ngModel]="commitMessage()"
                (ngModelChange)="commitMessage.set($event)"
                name="commitMessage"
                required
              />
            </label>
            <button class="btn btn-primary btn-sm" [disabled]="loading() || !commitMessageValid()" type="submit">
              提交修改
            </button>
          </form>
        }
        @if (operationError(); as failure) {
          <p class="operation-error" role="alert">操作失败：{{ failure }}</p>
        }
        @if (commitView(); as view) {
          <app-admin-config-commit
            [busy]="loading()"
            [canManage]="true"
            [allowApply]="canPublish()"
            [commit]="view"
            [offline]="offline()"
            (apply)="applyCommit($event)"
            (rollback)="rollbackCommit($event)"
          />
        }
        @if (databaseReady()) {
          <div class="model-config-list">
            <rxdb-entity-list
              [fixedFormData]="fixedFormData()"
              [fixedQuery]="workspaceQuery()"
              [name]="name()"
              namespace="public"
            />
          </div>
        }
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .model-config {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: clamp(1.25rem, 3vw, 2.75rem);
      color: var(--color-base-content);
    }
    h2 {
      margin: 0 0 0.35rem;
      font-size: 1.35rem;
      font-weight: 720;
    }
    p {
      margin: 0.35rem 0 0;
    }
    .section-kicker {
      color: var(--color-primary);
      margin-bottom: 0.45rem;
      font-size: 0.7rem;
      font-weight: 750;
    }
    .model-config-header {
      margin-bottom: 1.25rem;
    }
    .commit-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      margin: 1rem 0;
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      padding: 0.75rem 1rem;
      background: var(--color-base-100);
    }
    .commit-form label {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .branch-panel {
      margin: 1rem 0;
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      padding: 1rem;
      background: var(--color-base-100);
    }
    .branch-panel-header,
    .branch-controls,
    .branch-controls form,
    .branch-merge-list,
    .merge-preview {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
    }
    .branch-panel-header {
      justify-content: space-between;
    }
    .branch-panel h3 {
      margin: 0;
      font-size: 1rem;
    }
    .branch-controls {
      margin-top: 0.75rem;
    }
    .branch-controls label {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .branch-current,
    .branch-hint {
      color: var(--color-base-content);
      opacity: 0.78;
    }
    .branch-hint {
      margin-top: 0.6rem;
    }
    .branch-merge-list {
      margin-top: 0.75rem;
    }
    .merge-preview {
      align-items: flex-start;
      margin-top: 0.75rem;
      border-left: 0.25rem solid var(--color-primary);
      padding-left: 0.75rem;
    }
    .merge-preview p {
      flex-basis: 100%;
    }
    .merge-preview ul {
      flex-basis: 100%;
      margin: 0;
    }
    .operation-error {
      margin: 0.75rem 0;
      color: var(--color-error);
    }
    .model-config-list {
      height: clamp(24rem, 65dvh, 50rem);
      margin-top: 1rem;
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      overflow: hidden;
      background: var(--color-base-100);
    }
  `
})
export class AdminConfigModelComponent {
  private readonly host = inject(AdminConfigDatabaseHost);
  private readonly destroyRef = inject(DestroyRef);
  private projection: AdminConfigProjection | null = null;
  private readonly subscriptions: Subscription[] = [];
  private readonly localChanges = new Subject<void>();
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly name = input.required<ConfigName>();
  readonly title = input.required<string>();
  readonly commitMessageLimit = COMMIT_MESSAGE_LIMIT;
  readonly permission = signal<AdminConfigPermission>('unknown');
  readonly loading = signal(false);
  readonly message = signal<string | null>(null);
  readonly conflict = signal<string | null>(null);
  /** 应用或回滚被服务端以版本冲突拒绝；只在提交详情里展示。 */
  readonly commitConflict = signal<string | null>(null);
  /** 提交、应用或回滚的非冲突失败；与读取失败分开展示。 */
  readonly operationError = signal<string | null>(null);
  readonly offline = signal(false);
  readonly syncState = signal<'idle' | 'syncing' | 'synced' | 'applied' | 'error' | 'offline'>('idle');
  readonly workspaceId = signal<string | null>(null);
  readonly databaseReady = signal(false);
  readonly empty = signal(false);
  readonly pendingChanges = signal(0);
  readonly branches = signal<readonly AdminConfigBranchView[]>([]);
  readonly activeBranchId = signal<string | null>(null);
  readonly branchName = signal('');
  readonly branchError = signal<string | null>(null);
  readonly workingTreeStateClean = signal(true);
  readonly mergePreview = signal<MergePreview | null>(null);
  readonly mergeSourceBranchId = signal<string | null>(null);
  readonly commit = signal<RemoteConfigCommitStatus | null>(null);
  readonly commitMessage = signal('');
  readonly workspaceQuery = computed(() => createAdminConfigWorkspaceQuery(this.workspaceId()));
  readonly fixedFormData = computed(() => createAdminConfigFixedFormData(this.workspaceId()));
  readonly commitView = computed(() => {
    const commit = this.commit();
    return commit ? toAdminConfigCommitView(commit, this.commitConflict()) : null;
  });
  readonly commitMessageValid = computed(() => {
    const value = this.commitMessage().trim();
    return value.length > 0 && value.length <= COMMIT_MESSAGE_LIMIT;
  });
  readonly workingTreeClean = computed(() => this.workingTreeStateClean() && this.pendingChanges() === 0);
  readonly localBranches = computed(() => this.branches().filter(branch => branch.local));
  readonly mergeCandidates = computed(() => this.localBranches().filter(branch => branch.id !== this.activeBranchId()));
  readonly mergeConflicts = computed(() => this.mergePreview()?.entries.filter(entry => entry.conflict !== null) ?? []);
  readonly mergeConflictCount = computed(() => mergeAdminConfigConflictCount(this.mergePreview()));
  readonly mergeDescription = computed(() => {
    const preview = this.mergePreview();
    return preview ? describeAdminConfigMerge(preview) : '';
  });
  readonly canPublish = computed(
    () =>
      this.activeBranchId() === 'main' &&
      this.commit()?.branchId === 'main' &&
      this.mergeConflictCount() === 0 &&
      this.workingTreeClean()
  );
  readonly syncLabel = computed(
    () =>
      ({
        idle: '尚未同步',
        syncing: '同步中',
        synced: '已与工作区同步',
        applied: '最近提交已应用',
        error: '同步失败，本机修改保留',
        offline: '离线，本机修改保留'
      })[this.syncState()]
  );

  constructor() {
    this.offline.set(typeof navigator !== 'undefined' && !navigator.onLine);
    if (this.offline()) this.syncState.set('offline');
    if (typeof window !== 'undefined') {
      const offlineListener = (): void => this.handleOffline();
      const onlineListener = (): void => this.handleOnline();
      window.addEventListener('offline', offlineListener);
      window.addEventListener('online', onlineListener);
      const timer = window.setInterval(() => void this.syncInBackground(), SYNC_INTERVAL_MS);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('offline', offlineListener);
        window.removeEventListener('online', onlineListener);
        window.clearInterval(timer);
      });
    }
    this.destroyRef.onDestroy(() => {
      this.projection?.stop();
      for (const subscription of this.subscriptions) subscription.unsubscribe();
    });
    effect(() => {
      const client = this.client();
      const identity = this.identity();
      untracked(() => void this.hydrate(client, identity));
    });
  }

  canApply(status: MediaConfigCommitStatus): boolean {
    return status === 'synced' || status === 'validated';
  }

  canRollback(status: MediaConfigCommitStatus): boolean {
    return status === 'applied' || status === 'released';
  }

  retry(): void {
    void this.hydrate(this.client(), this.identity());
  }

  async createBranch(): Promise<void> {
    if (this.loading()) return;
    let branchId: string;
    try {
      branchId = normalizeAdminConfigBranchId(this.branchName());
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '分支名称无效。');
      return;
    }
    if (this.branches().some(branch => branch.id === branchId)) {
      this.branchError.set(`分支 ${branchId} 已存在。`);
      return;
    }
    const database = this.host.require();
    if (!(await this.ensureWorkingTreeClean(database))) return;
    this.loading.set(true);
    this.branchError.set(null);
    try {
      const history = await database.workingTree.listCommits();
      if (history.headCommitId) {
        const result = await database.workingTree.createBranchFromCommit(branchId, history.headCommitId);
        if (!result.ok) {
          this.branchError.set(`无法创建分支：${result.reason}。`);
          return;
        }
      } else {
        await database.versionManager.createBranch(branchId);
      }
      const status = await database.workingTree.status();
      await database.versionManager.switchBranch(branchId, {
        requireClean: true,
        expectedActivationRevision: status.activationRevision
      });
      this.branchName.set('');
      await this.afterBranchChange(database);
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '创建分支失败。');
    } finally {
      this.loading.set(false);
    }
  }

  async switchBranch(branchId: string): Promise<void> {
    if (this.loading() || branchId === this.activeBranchId()) return;
    const database = this.host.require();
    if (!(await this.ensureWorkingTreeClean(database))) return;
    const status = await database.workingTree.status();
    this.loading.set(true);
    this.branchError.set(null);
    try {
      await database.versionManager.switchBranch(branchId, {
        requireClean: true,
        expectedActivationRevision: status.activationRevision
      });
      await this.afterBranchChange(database);
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '切换分支失败。');
    } finally {
      this.loading.set(false);
    }
  }

  async previewMerge(sourceBranchId: string): Promise<void> {
    if (this.loading()) return;
    const database = this.host.require();
    if (!(await this.ensureWorkingTreeClean(database))) return;
    this.loading.set(true);
    this.branchError.set(null);
    try {
      const preview = await database.versionManager.previewMerge(sourceBranchId, { strategy: 'squash' });
      this.mergeSourceBranchId.set(sourceBranchId);
      this.mergePreview.set(preview);
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '合并预览失败。');
    } finally {
      this.loading.set(false);
    }
  }

  async mergePreviewBranch(): Promise<void> {
    const sourceBranchId = this.mergeSourceBranchId();
    if (!sourceBranchId || this.mergeConflictCount() > 0 || this.loading()) return;
    const database = this.host.require();
    if (!(await this.ensureWorkingTreeClean(database))) return;
    this.loading.set(true);
    this.branchError.set(null);
    try {
      await database.versionManager.mergeBranch(sourceBranchId, { strategy: 'squash', deleteSource: false });
      await this.afterBranchChange(database);
      this.message.set(`分支 ${sourceBranchId} 已合并到 ${this.activeBranchId()}。`);
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '合并分支失败。');
    } finally {
      this.loading.set(false);
    }
  }

  clearMergePreview(): void {
    this.mergeSourceBranchId.set(null);
    this.mergePreview.set(null);
  }

  async commitChanges(): Promise<void> {
    const message = this.commitMessage().trim();
    if (!this.commitMessageValid() || this.loading()) return;
    const database = this.host.require();
    this.loading.set(true);
    this.operationError.set(null);
    try {
      const status = await database.workingTree.status();
      const result = await database.workingTree.commit(message, {
        expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
        expectedHeadRevision: status.headRevision,
        expectedWorkingTreeRevision: status.workingTreeRevision,
        authorId: normalizeAdminUserId(this.identity()),
        operationId: crypto.randomUUID()
      });
      if (!result.ok) {
        this.conflict.set('本机修改在提交前已被其他操作更新，请核对后重新提交。');
        return;
      }
      this.commitMessage.set('');
      await this.refreshPending(database);
      await this.refreshBranches(database);
      if (!this.offline()) await this.host.syncNow();
    } catch (error) {
      this.operationError.set(error instanceof Error ? error.message : '提交本机修改失败。');
    } finally {
      this.loading.set(false);
    }
  }

  async applyCommit(commitId: string): Promise<void> {
    const commit = this.commit();
    if (!commit || commit.id !== commitId || !this.canApply(commit.status) || !this.canPublish() || this.loading()) {
      if (commit && !this.canPublish()) this.operationError.set('只有无冲突的 main 分支提交才能发布。');
      return;
    }
    await this.runRemote(async client => {
      const receipt = await client.applyConfigCommit(commit.id, commit.operationId);
      await this.writeBackRevisions(parseAppliedRevisions(receipt));
      this.syncState.set('applied');
    }, '配置应用失败。');
  }

  async rollbackCommit(commitId: string): Promise<void> {
    const commit = this.commit();
    if (!commit || commit.id !== commitId || !this.canRollback(commit.status) || this.loading()) return;
    await this.runRemote(async client => {
      const receipt = await client.rollbackConfigCommit(commit.id, crypto.randomUUID());
      await this.writeBackRevisions(parseAppliedRevisions(receipt));
    }, '安全回滚失败。');
  }

  private async runRemote(operation: (client: ProductClient) => Promise<void>, fallbackMessage: string): Promise<void> {
    const client = this.client();
    this.loading.set(true);
    this.commitConflict.set(null);
    this.operationError.set(null);
    try {
      await operation(client);
      const workspaceId = this.workspaceId();
      if (workspaceId) await this.refreshRemoteCommit(client, workspaceId, this.activeBranchId() ?? 'main');
    } catch (error) {
      this.reportRemoteError(error, fallbackMessage, 'commit');
    } finally {
      this.loading.set(false);
    }
  }

  /** 撤权一律收起特权界面；冲突与失败按发生位置分别展示：页面读取 / 同步，或提交详情里的应用 / 回滚。 */
  private reportRemoteError(error: unknown, fallbackMessage: string, scope: 'page' | 'commit' = 'page'): void {
    if (error instanceof ProductRequestError && (error.status === 401 || error.status === 403)) {
      this.permission.set('denied');
      return;
    }
    const message = error instanceof Error ? error.message : fallbackMessage;
    const conflicted = error instanceof ProductRequestError && error.status === 409;
    if (scope === 'commit') (conflicted ? this.commitConflict : this.operationError).set(message);
    else (conflicted ? this.conflict : this.message).set(message);
  }

  private handleOffline(): void {
    this.offline.set(true);
    this.syncState.set('offline');
  }

  private handleOnline(): void {
    if (!this.offline()) return;
    this.offline.set(false);
    this.syncState.set('idle');
    void this.syncInBackground();
  }

  private async hydrate(client: ProductClient, identity: string): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set(null);
    try {
      const access = await client.authorization();
      await client.admin('session');
      this.permission.set('granted');
      const workspace =
        (await client.ownWorkspace(access)) ?? (await client.ensureWorkspace(access, crypto.randomUUID()));
      const workspaceId = normalizeAdminUserId(workspace.id);
      const supabase = createAdminSupabaseSyncClient(
        access.config,
        async () => (await client.authorization()).session.access_token
      );
      const database = await this.host.open({ userId: identity, workspaceId, supabase });
      this.workspaceId.set(workspaceId);
      this.databaseReady.set(true);
      await this.refreshBranches(database);
      this.watchLocal(database, workspaceId);
      this.startProjection(database, client, identity, workspaceId);
      await this.synchronize(client, database, workspaceId);
    } catch (error) {
      // 权限未确认时保持 unknown：不渲染任何特权控件，只给出错误与重新读取。
      this.reportRemoteError(error, '配置恢复失败。');
    } finally {
      this.loading.set(false);
    }
  }

  /** 先拉取再导入旧草稿：只补本机与工作区都没有的标识，不覆盖已有修改。 */
  private async synchronize(client: ProductClient, database: RxDB, workspaceId: UUID): Promise<void> {
    if (this.offline()) {
      this.syncState.set('offline');
      return;
    }
    this.syncState.set('syncing');
    try {
      await this.host.syncNow();
      await this.seedLegacyDrafts(client, database, workspaceId);
      await database.syncManager.sync();
      await this.refreshBranches(database);
      await this.projection?.compensate();
      await this.refreshRemoteCommit(client, workspaceId, this.activeBranchId() ?? 'main');
      this.syncState.set(this.commit()?.status === 'applied' ? 'applied' : 'synced');
    } catch (error) {
      this.syncState.set(this.offline() ? 'offline' : 'error');
      this.message.set(error instanceof Error ? error.message : '配置同步失败，本机修改已保留。');
    }
  }

  private async syncInBackground(): Promise<void> {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.offline() || this.loading() || !this.databaseReady()) return;
    await this.synchronize(this.client(), this.host.require(), workspaceId as UUID);
  }

  private watchLocal(database: RxDB, workspaceId: UUID): void {
    const repository = database.entityManager.getRepository(CONFIG_TYPES[this.name()]);
    this.subscriptions.push(
      repository
        .findAll({ where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] } })
        .subscribe(rows => {
          this.empty.set(rows.length === 0);
          this.localChanges.next();
        }),
      this.localChanges.pipe(debounceTime(150)).subscribe(() => void this.refreshPending(database))
    );
  }

  /** 未提交修改只计配置内容；应用后写回的 revision 是簿记，不提示管理员提交。 */
  private async refreshPending(database: RxDB): Promise<void> {
    const diff = await database.workingTree.diff();
    this.pendingChanges.set(diff.entries.filter(isConfigContentUnit).length);
  }

  private async ensureWorkingTreeClean(database: RxDB): Promise<boolean> {
    try {
      const status = await database.workingTree.status();
      this.activeBranchId.set(status.branchId);
      this.workingTreeStateClean.set(status.clean && !status.restoring && !status.conflicted);
      await this.refreshPending(database);
      if (status.restoring) {
        this.branchError.set('工作树正在恢复，完成后才能切换或合并分支。');
        return false;
      }
      if (status.conflicted) {
        this.branchError.set('工作树存在未解决冲突，解决后才能切换或合并分支。');
        return false;
      }
      if (!status.clean) {
        this.branchError.set('当前分支有未提交修改，先提交或丢弃后才能切换或合并分支。');
        return false;
      }
      return true;
    } catch (error) {
      this.branchError.set(error instanceof Error ? error.message : '无法读取工作树状态。');
      return false;
    }
  }

  private async refreshBranches(database: RxDB): Promise<void> {
    const branches = await firstValueFrom(
      database.entityManager.getRepository(RxDBBranch).findAll({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'id', sort: 'asc' }]
      })
    );
    this.branches.set(
      branches
        .map(toAdminConfigBranchView)
        .sort((left, right) => left.id.localeCompare(right.id))
    );
    const status = await database.workingTree.status();
    this.activeBranchId.set(status.branchId);
    this.workingTreeStateClean.set(status.clean && !status.restoring && !status.conflicted);
  }

  private async afterBranchChange(database: RxDB): Promise<void> {
    await this.refreshBranches(database);
    await this.refreshPending(database);
    this.clearMergePreview();
    this.commit.set(null);
    const workspaceId = this.workspaceId();
    if (workspaceId && !this.offline()) {
      await this.refreshRemoteCommit(this.client(), workspaceId, this.activeBranchId() ?? 'main');
    }
  }

  private startProjection(database: RxDB, client: ProductClient, identity: string, workspaceId: UUID): void {
    if (this.projection) return;
    this.projection = createAdminConfigProjection({
      workingTree: database.workingTree,
      workspaceId,
      authorId: normalizeAdminUserId(identity),
      store: createAdminConfigProjectionStore(client),
      readEntity: (entity, entityId) => this.readEntity(database, entity, entityId, workspaceId),
      onProjected: envelope => this.commit.set(this.projectedStatus(envelope)),
      shouldProject: branchId => branchId === 'main'
    });
    this.subscriptions.push(
      this.projection.errors$.subscribe(error => {
        this.message.set(error instanceof Error ? error.message : '配置提交投影失败。');
        this.syncState.set('error');
      })
    );
    void this.projection
      .start()
      .catch(error => this.message.set(error instanceof Error ? error.message : '配置提交投影失败。'));
  }

  private projectedStatus(envelope: MediaConfigCommitEnvelope): RemoteConfigCommitStatus {
    return {
      id: envelope.commit.id,
      workspaceId: envelope.commit.workspaceId,
      branchId: envelope.commit.branchId,
      parentIds: [...envelope.commit.parentIds],
      authorId: envelope.commit.authorId,
      message: envelope.commit.message,
      operationId: envelope.commit.operationId,
      status: 'synced',
      createdAt: new Date().toISOString(),
      appliedAt: null,
      releasedAt: null,
      rejectionCode: null
    };
  }

  private async refreshRemoteCommit(client: ProductClient, workspaceId: string, branchId: string): Promise<void> {
    const remote = await client.latestConfigCommit(workspaceId, branchId);
    this.commit.set(remote);
  }

  private async readEntity(
    database: RxDB,
    entity: string,
    entityId: string,
    workspaceId: UUID
  ): Promise<Record<string, unknown> | null> {
    const type = CONFIG_TYPES[entity];
    if (!type) throw new Error(`实体 ${entity} 不允许读取。`);
    const rows = await firstValueFrom(
      database.entityManager.getRepository(type).findAll({
        where: {
          combinator: 'and',
          rules: [
            { field: 'id', operator: '=', value: entityId as UUID },
            { field: 'workspaceId', operator: '=', value: workspaceId }
          ]
        }
      })
    );
    return rows[0] ? { ...rows[0] } : null;
  }

  /** 应用或回滚成功后写回服务端 revision，下一次编辑以它作为 CAS 预期值。 */
  private async writeBackRevisions(revisions: readonly AppliedRevision[]): Promise<void> {
    const database = this.host.require();
    for (const applied of revisions) {
      const type = CONFIG_TYPES[applied.entity];
      if (!type) continue;
      const repository = database.entityManager.getRepository(type);
      const [row] = await firstValueFrom(
        repository.findAll({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: applied.entityId as UUID }] }
        })
      );
      if (row && (row as { revision?: number }).revision !== applied.revision)
        await repository.update(row, { revision: applied.revision });
    }
  }

  /** 旧版后台的草稿只作一次性导入：本机已有同一标识时跳过，绝不覆盖。 */
  private async seedLegacyDrafts(client: ProductClient, database: RxDB, workspaceId: UUID): Promise<void> {
    const content = (await client.admin('content')) as ContentPage;
    const kind = this.name() === 'MediaPromptTemplate' ? 'template' : 'provider-policy';
    const type = CONFIG_TYPES[this.name()];
    const repository = database.entityManager.getRepository(type);
    const existing = await firstValueFrom(
      repository.findAll({
        where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] }
      })
    );
    const keys = new Set(existing.map(row => (row as { key: string }).key));
    for (const row of content.drafts.filter(draft => draft.kind === kind && !keys.has(draft.key))) {
      await repository.create(database.entityManager.instantiate(type, this.legacyFields(row, workspaceId)));
    }
  }

  private legacyFields(row: ContentRow, workspaceId: UUID): Record<string, unknown> {
    const payload = rowPayload(row);
    const base = {
      workspaceId,
      branchId: 'main',
      revision: Math.max(1, row.revision),
      key: row.key,
      enabled: payload['enabled'] !== false
    };
    if (this.name() === 'MediaPromptTemplate') {
      return {
        ...base,
        title: typeof payload['title'] === 'string' ? payload['title'] : row.key,
        prompt: typeof payload['prompt'] === 'string' ? payload['prompt'] : '',
        purpose: typeof payload['purpose'] === 'string' ? payload['purpose'] : null,
        style: typeof payload['style'] === 'string' ? payload['style'] : null,
        tags:
          Array.isArray(payload['tags']) ? payload['tags'].filter((tag): tag is string => typeof tag === 'string') : []
      };
    }
    return {
      ...base,
      version: typeof payload['version'] === 'number' ? payload['version'] : 1,
      providers: Array.isArray(payload['providers']) ? [...payload['providers']] : []
    };
  }
}
