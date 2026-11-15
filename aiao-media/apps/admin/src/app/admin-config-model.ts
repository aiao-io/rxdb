import {
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  type MediaPromptTemplate as MediaPromptTemplateType,
  type MediaProviderPolicy as MediaProviderPolicyType
} from '@aiao-media/domain';
import { RxDB, type UUID } from '@aiao/rxdb';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { firstValueFrom, type Subscription } from 'rxjs';
import { ProductRequestError, type ProductClient, type RemoteConfigCommitStatus } from './product-client';
import { normalizeAdminUserId } from './admin-rxdb';
import {
  createAdminConfigProjection,
  createAdminConfigProjectionStore,
  type AdminConfigProjection,
  type AdminConfigProjectionOptions
} from './admin-config-projection';

interface ContentRow {
  kind: 'template' | 'provider-policy';
  key: string;
  revision: number;
  payload: unknown;
}

interface ContentPage {
  drafts: ContentRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rowPayload(row: ContentRow): Record<string, unknown> {
  if (!isRecord(row.payload)) throw new Error('配置草稿格式无效。');
  return row.payload;
}

/** 为配置实体列表固定当前工作区，避免账号切换后读取其他工作区的本地记录。 */
export function createAdminConfigWorkspaceQuery(workspaceId: string | null):
  | { combinator: 'and'; rules: [{ field: 'workspaceId'; operator: '='; value: string }] }
  | undefined {
  if (!workspaceId) return undefined;
  return { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] };
}

/** Admin 配置页面：RxDB 实体作为唯一显示和编辑状态，旧内容接口只负责首次水合。 */
@Component({
  selector: 'app-admin-config-model',
  imports: [EntityListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="model-config" [attr.data-testid]="'model-config-' + name()">
      <header class="model-config-header">
        <div>
          <p class="section-kicker">内容管理</p>
          <h2>{{ title() }}</h2>
          <p>编辑内容保留在本地。配置应用后，请核对发布状态再确认对用户生效。</p>
        </div>
        @if (loading()) {
          <span role="status">正在恢复本地配置…</span>
        }
      </header>
      <div class="model-config-state" aria-live="polite">
        <span>分支：{{ branchId() }}</span>
        <span>同步：{{ syncLabel() }}</span>
        @if (offline()) {
          <span class="state-warning">当前离线，变更保存在本地</span>
        }
        @if (conflict(); as conflictMessage) {
          <span class="state-error">冲突：{{ conflictMessage }}</span>
        }
      </div>
      @if (commit(); as currentCommit) {
        <article class="commit-card" aria-label="配置提交状态">
          <div>
            <strong>最近提交 {{ currentCommit.id }}</strong>
            <p>{{ currentCommit.message }}</p>
            <small>操作者：{{ currentCommit.authorId }} · 父提交：{{ currentCommit.parentIds.length }}</small>
          </div>
          <div class="commit-actions">
            <span class="commit-status">{{ currentCommit.status }}</span>
            @if (canApply(currentCommit.status)) {
              <button class="btn btn-primary btn-sm" type="button" [disabled]="loading() || offline()" (click)="applyCommit()">
                应用提交
              </button>
            }
            @if (canRollback(currentCommit.status)) {
              <button class="btn btn-outline btn-sm" type="button" [disabled]="loading() || offline()" (click)="rollbackCommit()">
                执行安全回滚
              </button>
            }
            @if (currentCommit.rejectionCode) {
              <small class="state-error">拒绝原因：{{ currentCommit.rejectionCode }}</small>
            }
          </div>
        </article>
      }
      @if (permissionDenied()) {
        <p class="state-error" role="alert">当前账号没有配置管理权限。</p>
      }
      @if (message()) {
        <p class="state-error" role="alert">{{ message() }}</p>
      }
      @if (workspaceId() && !permissionDenied()) {
        <div class="model-config-list">
          <rxdb-entity-list [fixedQuery]="workspaceQuery()" [name]="name()" namespace="media" />
        </div>
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
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 1.25rem;
    }
    .model-config-state,
    .commit-card {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
      margin: 1rem 0;
    }
    .model-config-state {
      font-size: 0.875rem;
    }
    .state-warning {
      color: var(--color-warning-content);
      background: var(--color-warning);
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
    }
    .state-error {
      color: var(--color-error);
    }
    .commit-card {
      justify-content: space-between;
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      padding: 1rem;
      background: var(--color-base-100);
    }
    .commit-card small {
      display: block;
      margin: 0.25rem 0 0;
      overflow-wrap: anywhere;
    }
    .commit-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .commit-status {
      border-radius: 999px;
      background: var(--color-base-200);
      padding: 0.25rem 0.5rem;
    }
    .model-config-list {
      height: clamp(24rem, 65dvh, 50rem);
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      overflow: hidden;
      background: var(--color-base-100);
    }
  `
})
export class AdminConfigModelComponent {
  private readonly db = inject(RxDB);
  private readonly destroyRef = inject(DestroyRef);
  private projection: AdminConfigProjection | null = null;
  private projectionErrors: Subscription | null = null;
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly name = input.required<'MediaPromptTemplate' | 'MediaProviderPolicy'>();
  readonly title = input.required<string>();
  readonly loading = signal(false);
  readonly message = signal('');
  readonly branchId = signal('main');
  readonly workspaceId = signal<string | null>(null);
  readonly workspaceQuery = computed(() => createAdminConfigWorkspaceQuery(this.workspaceId()));
  readonly syncState = signal<'idle' | 'syncing' | 'synced' | 'applied' | 'conflict' | 'error' | 'offline'>('idle');
  readonly offline = signal(false);
  readonly conflict = signal<string | null>(null);
  readonly permissionDenied = signal(false);
  readonly commit = signal<RemoteConfigCommitStatus & { message: string } | null>(null);
  readonly syncLabel = computed(() => ({
    idle: '未开始',
    syncing: '同步中',
    synced: '已同步，待应用',
    applied: '已应用',
    conflict: '发生冲突',
    error: '同步失败',
    offline: '离线保存'
  })[this.syncState()]);

  constructor() {
    this.offline.set(typeof navigator !== 'undefined' && !navigator.onLine);
    if (this.offline()) this.syncState.set('offline');
    if (typeof window !== 'undefined') {
      const offlineListener = (): void => this.handleOffline();
      const onlineListener = (): void => this.handleOnline();
      window.addEventListener('offline', offlineListener);
      window.addEventListener('online', onlineListener);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('offline', offlineListener);
        window.removeEventListener('online', onlineListener);
      });
    }
    effect(() => {
      const client = this.client();
      const identity = this.identity();
      untracked(() => void this.hydrate(client, identity));
    });
  }

  canApply(status: string): boolean {
    return status === 'synced' || status === 'validated';
  }

  canRollback(status: string): boolean {
    return status === 'applied' || status === 'released';
  }

  async applyCommit(): Promise<void> {
    const commit = this.commit();
    if (!commit || !this.canApply(commit.status)) return;
    this.loading.set(true);
    this.message.set('');
    this.permissionDenied.set(false);
    try {
      await this.client().applyConfigCommit(commit.id, commit.operationId);
      await this.refreshRemoteCommit(this.client(), commit.workspaceId);
      this.commit.update(value => value ? { ...value, status: 'applied' } : value);
      this.syncState.set('applied');
    } catch (error) {
      this.permissionDenied.set(error instanceof ProductRequestError && (error.status === 401 || error.status === 403));
      this.message.set(error instanceof Error ? error.message : '配置应用失败。');
      this.syncState.set('conflict');
    } finally {
      this.loading.set(false);
    }
  }

  async rollbackCommit(): Promise<void> {
    const commit = this.commit();
    if (!commit || !this.canRollback(commit.status)) return;
    this.loading.set(true);
    this.message.set('');
    this.permissionDenied.set(false);
    try {
      await this.client().rollbackConfigCommit(commit.id, crypto.randomUUID());
      await this.refreshRemoteCommit(this.client(), commit.workspaceId);
      this.message.set('已执行安全回滚，配置版本已回退。');
      this.syncState.set('synced');
    } catch (error) {
      this.permissionDenied.set(error instanceof ProductRequestError && (error.status === 401 || error.status === 403));
      this.message.set(error instanceof Error ? error.message : '安全回滚失败。');
      this.syncState.set('conflict');
    } finally {
      this.loading.set(false);
    }
  }

  private handleOffline(): void {
    this.offline.set(true);
    this.syncState.set('offline');
  }

  private handleOnline(): void {
    if (!this.offline()) return;
    this.offline.set(false);
    this.syncState.set('syncing');
    const projection = this.projection;
    if (!projection) {
      this.syncState.set('idle');
      return;
    }
    void projection.compensate().then(() => {
      if (this.offline() || this.syncState() !== 'syncing') return;
      this.syncState.set(this.commit() ? 'synced' : 'idle');
    }).catch(error => {
      if (this.offline()) return;
      this.message.set(error instanceof Error ? error.message : '网络恢复后的配置同步失败。');
      this.syncState.set('error');
    });
  }

  private async hydrate(client: ProductClient, identity: string): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set('');
    try {
      const access = await client.authorization();
      const workspace = await client.ownWorkspace(access) ?? await client.ensureWorkspace(access, crypto.randomUUID());
      const workspaceId = normalizeAdminUserId(workspace.id);
      const content = (await client.admin('content')) as ContentPage;
      await this.db.connect('sqlite-wasm');
      this.db.context = { userId: normalizeAdminUserId(identity) };
      this.workspaceId.set(workspaceId);
      await this.hydrateRows(content.drafts, workspaceId);
      await this.startProjection(client, identity, workspaceId);
      await this.refreshRemoteCommit(client, workspaceId);
    } catch (error) {
      this.permissionDenied.set(error instanceof ProductRequestError && (error.status === 401 || error.status === 403));
      this.offline.set(typeof navigator !== 'undefined' && !navigator.onLine);
      this.syncState.set(this.offline() ? 'offline' : 'error');
      this.message.set(error instanceof Error ? error.message : '配置恢复失败。');
    } finally {
      this.loading.set(false);
    }
  }

  private async startProjection(client: ProductClient, identity: string, workspaceId: UUID): Promise<void> {
    if (this.projection) return;
    const authorId = normalizeAdminUserId(identity);
    await this.db.workingTree.enable();
    const branch = await this.db.workingTree.listCommits();
    this.branchId.set(branch.branchId);
    const options: AdminConfigProjectionOptions = {
      workingTree: this.db.workingTree,
      workspaceId,
      authorId,
      store: createAdminConfigProjectionStore(this.db),
      readEntity: (entity, entityId) => this.readProjectionEntity(entity, entityId, workspaceId),
      sync: async envelope => {
        this.syncState.set('syncing');
        this.conflict.set(null);
        try {
          await client.pushConfigCommit(envelope);
        } catch (error) {
          const message = error instanceof Error ? error.message : '配置提交同步失败。';
          this.conflict.set(message);
          this.syncState.set(message.includes('冲突') ? 'conflict' : 'error');
          throw error;
        }
      },
      onProjected: envelope => {
        this.commit.set({
          ...envelope.commit,
          message: envelope.commit.message,
          createdAt: new Date().toISOString(),
          appliedAt: null,
          releasedAt: null,
          rejectionCode: null
        });
        this.branchId.set(envelope.commit.branchId);
        this.syncState.set('synced');
      }
    };
    this.projection = createAdminConfigProjection(options);
    this.projectionErrors = this.projection.errors$.subscribe(error => {
      this.message.set(error instanceof Error ? error.message : '配置提交投影失败。');
      this.syncState.set('error');
    });
    this.destroyRef.onDestroy(() => {
      this.projection?.stop();
      this.projectionErrors?.unsubscribe();
    });
    await this.projection.start();
  }

  private async refreshRemoteCommit(client: ProductClient, workspaceId: string): Promise<void> {
    const remote = await client.latestConfigCommit(workspaceId);
    if (!remote) return;
    this.commit.update(current => ({
      ...remote,
      message: current?.message ?? '配置提交'
    }));
    this.branchId.set(remote.branchId);
    if (remote.status === 'rejected') this.syncState.set('conflict');
    else if (remote.status === 'applied' || remote.status === 'released') this.syncState.set('applied');
    else if (remote.status === 'synced' || remote.status === 'validated') this.syncState.set('synced');
  }

  private async readProjectionEntity(entity: string, entityId: string, workspaceId: UUID): Promise<Record<string, unknown> | null> {
    const id = entityId as UUID;
    if (entity === 'MediaPromptTemplate') {
      const rows = await firstValueFrom(this.db.entityManager.getRepository(MediaPromptTemplate).findAll({
        where: { combinator: 'and', rules: [
          { field: 'id', operator: '=', value: id },
          { field: 'workspaceId', operator: '=', value: workspaceId }
        ] }
      }));
      return rows[0] ? Object.fromEntries(Object.entries(rows[0])) : null;
    }
    if (entity === 'MediaProviderPolicy') {
      const rows = await firstValueFrom(this.db.entityManager.getRepository(MediaProviderPolicy).findAll({
        where: { combinator: 'and', rules: [
          { field: 'id', operator: '=', value: id },
          { field: 'workspaceId', operator: '=', value: workspaceId }
        ] }
      }));
      return rows[0] ? Object.fromEntries(Object.entries(rows[0])) : null;
    }
    if (entity === 'MediaPlatformModel') {
      const rows = await firstValueFrom(this.db.entityManager.getRepository(MediaPlatformModel).findAll({
        where: { combinator: 'and', rules: [
          { field: 'id', operator: '=', value: id },
          { field: 'workspaceId', operator: '=', value: workspaceId }
        ] }
      }));
      return rows[0] ? Object.fromEntries(Object.entries(rows[0])) : null;
    }
    throw new Error(`实体 ${entity} 不允许读取。`);
  }

  private async hydrateRows(rows: readonly ContentRow[], workspaceId: string): Promise<void> {
    const normalizedWorkspaceId = normalizeAdminUserId(workspaceId);
    const selected = rows.filter(row => row.kind === (this.name() === 'MediaPromptTemplate' ? 'template' : 'provider-policy'));
    if (this.name() === 'MediaPromptTemplate') {
      await this.hydrateTemplates(selected, normalizedWorkspaceId);
      return;
    }
    await this.hydratePolicies(selected, normalizedWorkspaceId);
  }

  private async hydrateTemplates(rows: readonly ContentRow[], workspaceId: ReturnType<typeof normalizeAdminUserId>): Promise<void> {
    const repository = this.db.entityManager.getRepository(MediaPromptTemplate);
    const existing = await firstValueFrom(repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] }
    }));
    for (const row of rows) {
      const payload = rowPayload(row);
      const current = existing.find(item => item.key === row.key);
      const data = {
        workspaceId,
        branchId: 'main',
        revision: row.revision,
        key: row.key,
        title: typeof payload['title'] === 'string' ? payload['title'] : row.key,
        prompt: typeof payload['prompt'] === 'string' ? payload['prompt'] : '',
        purpose: typeof payload['purpose'] === 'string' ? payload['purpose'] : null,
        style: typeof payload['style'] === 'string' ? payload['style'] : null,
        tags: Array.isArray(payload['tags']) ? payload['tags'].filter((tag): tag is string => typeof tag === 'string') : [],
        enabled: payload['enabled'] !== false
      } satisfies Partial<MediaPromptTemplateType>;
      if (current) await repository.update(current, data);
      else await repository.create(new MediaPromptTemplate(data));
    }
  }

  private async hydratePolicies(rows: readonly ContentRow[], workspaceId: ReturnType<typeof normalizeAdminUserId>): Promise<void> {
    const repository = this.db.entityManager.getRepository(MediaProviderPolicy);
    const existing = await firstValueFrom(repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }] }
    }));
    for (const row of rows) {
      const payload = rowPayload(row);
      const current = existing.find(item => item.key === row.key);
      const data = {
        workspaceId,
        branchId: 'main',
        revision: row.revision,
        key: row.key,
        version: typeof payload['version'] === 'number' ? payload['version'] : 1,
        providers: Array.isArray(payload['providers']) ? [...payload['providers']] : [],
        enabled: payload['enabled'] !== false
      } satisfies Partial<MediaProviderPolicyType>;
      if (current) await repository.update(current, data);
      else await repository.create(new MediaProviderPolicy(data));
    }
  }
}
