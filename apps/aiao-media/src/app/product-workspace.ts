import { BehaviorSubject } from 'rxjs';
import type { TaskReport } from '../contracts/product-data.mjs';
import type { ProductSnapshot } from '../local-data/product-projection';
import type {
  ApplyProductSync,
  ProductConflict,
  ProductRecord,
  ProductSyncOptions,
  ProductSyncResult,
  ProductSyncStore
} from '../local-data/product-sync-store';
import {
  WorkspaceRegistry,
  type WorkspaceAccount,
  type WorkspaceProfile,
  type WorkspaceRegistryState
} from '../local-data/workspace-registry';
import type { ProductClient } from './product-client';
import type { ProductAuthorization } from './supabase-auth';
import type { WorkspaceSession } from './workspace-session';

export type ProductReplica = Pick<
  ProductSyncStore,
  'records' | 'conflicts' | 'capture' | 'synchronize' | 'resolve' | 'enqueueReports' | 'deleteDraft' | 'close'
>;
type ReplicaFactory = (
  profileId: string,
  workspaceId: string,
  access: ProductAuthorization,
  signal: AbortSignal
) => Promise<ProductReplica>;
type Counts = { drafts: number; providers: number; works: number };
type ProductApi = Pick<ProductClient, 'authorization' | 'ownWorkspace' | 'ensureWorkspace'>;
export interface ProductWorkspacePort {
  profile(): WorkspaceProfile | null;
  registry(state: WorkspaceRegistryState): void;
  ready(): Promise<void>;
  checkpoint(): Promise<void>;
  busy(): boolean;
  counts(): Promise<Counts>;
  snapshot(records: ProductRecord[]): Promise<ProductSnapshot>;
  project(
    records: ProductRecord[],
    blocked: Set<string>,
    versions: ProductSnapshot['versions'],
    force?: Set<string>
  ): Promise<void>;
  reports(workspaceId: string): Promise<TaskReport[]>;
}
export interface ProductWorkspaceState {
  status: 'local' | 'pending' | 'syncing' | 'synced' | 'paused' | 'conflict' | 'failed';
  busy: boolean;
  message: string;
  confirmation: { existing: boolean; counts: Counts } | null;
  conflicts: ProductConflict[];
  draftDeleted: boolean;
  pending: number;
}

/** 首次确认、复制生命周期和私有工作区投影的应用接线。 */
export class ProductWorkspaceController {
  private generation = 0;
  private captureVersion = 0;
  private previewVersion = 0;
  private closed = false;
  private replica: ProductReplica | null = null;
  private openedProfileId: string | null = null;
  private connection?: AbortController;
  private captureTimer?: ReturnType<typeof setTimeout>;
  private plan: { account: WorkspaceAccount; workspaceId: string | null; requestId?: string } | null = null;
  private readonly frame = new BehaviorSubject<ProductWorkspaceState>({
    status: 'local',
    busy: false,
    message: '',
    confirmation: null,
    conflicts: [],
    draftDeleted: false,
    pending: 0
  });
  readonly state$ = this.frame.asObservable();
  get state(): ProductWorkspaceState {
    return structuredClone(this.frame.value);
  }

  constructor(
    private readonly registry: WorkspaceRegistry,
    private readonly session: Pick<WorkspaceSession<unknown>, 'bind'>,
    private readonly api: ProductApi,
    private readonly port: ProductWorkspacePort,
    private readonly factory: ReplicaFactory = async (profileId, workspaceId, access, signal) => {
      const { ProductSyncStore } = await import('../local-data/product-sync-store');
      return ProductSyncStore.open(profileId, workspaceId, access, signal);
    }
  ) {}

  selection(): void {
    const profile = this.port.profile();
    if (this.openedProfileId && this.openedProfileId !== profile?.id)
      this.publish({ conflicts: [], draftDeleted: false, pending: 0 });
    if (!this.replica)
      this.publish({
        status:
          profile?.binding ?
            profile.binding.initialized ?
              'paused'
            : 'pending'
          : 'local'
      });
  }

  pause(): void {
    ++this.generation;
    ++this.captureVersion;
    ++this.previewVersion;
    this.plan = null;
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.connection?.abort();
    const old = this.replica;
    this.replica = null;
    if (old) void old.close();
    this.publish({ status: this.port.profile()?.binding ? 'paused' : 'local', busy: false, confirmation: null });
  }

  async requestEnable(): Promise<void> {
    const version = ++this.previewVersion,
      generation = this.generation;
    try {
      const access = await this.api.authorization(),
        workspace = await this.api.ownWorkspace(access),
        counts = await this.port.counts();
      if (!this.current(generation) || version !== this.previewVersion) return;
      this.plan = {
        account: { projectOrigin: access.config.url, userId: access.userId },
        workspaceId: workspace?.id ?? null,
        requestId: workspace?.request_id
      };
      this.publish({ confirmation: { existing: workspace !== null, counts }, message: '' });
    } catch {
      if (this.current(generation)) this.fail();
    }
  }

  cancelEnable(): void {
    ++this.previewVersion;
    this.plan = null;
    this.publish({ confirmation: null });
  }

  async confirmEnable(): Promise<void> {
    const plan = this.plan,
      confirmation = this.frame.value.confirmation;
    if (!plan || !confirmation || this.frame.value.busy || this.port.busy()) return;
    let generation = this.generation;
    try {
      const counts = await this.port.counts();
      if (!this.current(generation) || this.plan !== plan) return;
      if (JSON.stringify(counts) !== JSON.stringify(confirmation.counts)) {
        this.publish({ confirmation: { ...confirmation, counts }, message: '本机数据范围已变化，请再次确认。' });
        return;
      }
      const previous = this.port.profile()?.binding;
      const newCopy =
        !!plan.workspaceId &&
        !previous?.initialized &&
        previous?.remoteWorkspaceId !== plan.workspaceId &&
        previous?.requestId !== plan.requestId;
      const binding = await this.session.bind(plan.account, newCopy);
      if (!binding || this.generation !== generation + 1) return;
      generation++;
      this.publish({ busy: true, status: 'syncing', confirmation: null, message: '正在确认同步工作区…' });
      await this.port.ready();
      const access = await this.api.authorization();
      this.accountMatches(access, plan.account);
      if (!this.current(generation)) return;
      const remote = await this.api.ensureWorkspace(access, binding.requestId);
      if (!this.current(generation)) return;
      if (
        !binding.initialized &&
        binding.mode === 'create' &&
        !remote.created &&
        remote.request_id !== binding.requestId
      )
        throw new Error('工作区范围已变化，请重新确认。');
      await this.registry.recordRemote(plan.account, binding.requestId, remote.id);
      this.port.registry(await this.registry.read());
      const replica = await this.open(access, remote.id, generation);
      console.log('[media-sync] replica opened');
      if (!replica) return;
      await this.round(replica, generation, binding.mode === 'join' && !binding.initialized);
      console.log('[media-sync] round complete');
      if (!this.current(generation)) return;
      await this.registry.activateBinding(plan.account, binding.requestId, remote.id);
      this.port.registry(await this.registry.read());
      this.plan = null;
    } catch (error) {
      console.error('确认同步工作区失败', error);
      if (this.current(generation)) this.fail();
    } finally {
      if (this.current(generation)) this.publish({ busy: false });
    }
  }

  async resume(options: ProductSyncOptions = {}): Promise<void> {
    const profile = this.port.profile(),
      generation = this.generation;
    if (!profile?.account || !profile.binding?.initialized || !profile.binding.remoteWorkspaceId || this.port.busy())
      return;
    this.publish({ busy: true, status: 'syncing', message: '' });
    try {
      await this.port.ready();
      const access = await this.api.authorization();
      this.accountMatches(access, profile.account);
      const replica = await this.open(access, profile.binding.remoteWorkspaceId, generation);
      if (replica) await this.round(replica, generation, false, options);
    } catch {
      if (this.current(generation)) this.fail();
    } finally {
      if (this.current(generation)) this.publish({ busy: false });
    }
  }

  async synchronize(options: ProductSyncOptions = {}): Promise<void> {
    if (!this.replica) return this.resume(options);
    if (this.frame.value.busy || this.port.busy()) return;
    const generation = this.generation,
      replica = this.replica,
      account = this.port.profile()?.account;
    this.publish({ busy: true, status: 'syncing', message: '' });
    try {
      const access = await this.api.authorization();
      if (!account) throw new Error('当前副本没有绑定账号。');
      this.accountMatches(access, account);
      if (this.current(generation)) await this.round(replica, generation, false, options);
    } catch {
      if (this.current(generation)) this.fail();
    } finally {
      if (this.current(generation)) this.publish({ busy: false });
    }
  }

  captureSoon(): void {
    const version = ++this.captureVersion,
      generation = this.generation;
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => {
      void this.capture(version, generation);
    }, 350);
  }

  async reportTasks(): Promise<void> {
    const profile = this.port.profile(),
      replica = this.replica,
      generation = this.generation;
    if (!profile?.binding?.remoteWorkspaceId || !replica || this.frame.value.busy) return;
    try {
      const reports = await this.port.reports(profile.binding.remoteWorkspaceId);
      if (!this.current(generation)) return;
      await replica.enqueueReports(reports);
      if (this.current(generation)) await this.synchronize();
    } catch {
      if (this.current(generation)) this.fail();
    }
  }

  async deleteDraft(): Promise<void> {
    const replica = this.replica,
      generation = this.generation;
    if (!replica || this.frame.value.busy || this.port.busy()) return;
    try {
      await this.port.checkpoint();
      if (!this.current(generation)) return;
      await replica.deleteDraft();
      if (this.current(generation)) await this.synchronize();
    } catch {
      if (this.current(generation)) this.fail();
    }
  }

  async resolveConflict(id: string, choice: 'local' | 'remote'): Promise<void> {
    const replica = this.replica,
      generation = this.generation;
    const conflict = this.frame.value.conflicts.find(item => item.id === id);
    if (!replica || !conflict || this.frame.value.busy || this.port.busy()) return;
    this.publish({ busy: true, status: 'syncing' });
    ++this.captureVersion;
    try {
      await this.port.checkpoint();
      if (!this.current(generation)) return;
      const snapshot = await this.port.snapshot(await replica.records());
      if (!this.current(generation)) return;
      const local = snapshot.entries.find(
        entry => entry.kind === conflict.local.kind && entry.sourceId === conflict.local.sourceId
      );
      const result = await replica.resolve(
        id,
        choice,
        choice === 'local' ? { payload: local?.payload ?? conflict.local.payload, deleted: !local } : undefined,
        this.apply(snapshot, generation, choice === 'remote' ? new Set([conflict.recordId]) : undefined)
      );
      if (this.current(generation)) this.accept(result);
    } catch {
      if (this.current(generation)) {
        const conflicts = await replica.conflicts();
        if (this.current(generation))
          this.publish({
            conflicts,
            status: 'conflict',
            message: '同步端修订或授权已变化。双方版本保留，请核对后重新选择。'
          });
      }
    } finally {
      if (this.current(generation)) this.publish({ busy: false });
    }
  }

  close(): void {
    this.closed = true;
    this.pause();
    this.frame.complete();
  }

  private async round(
    replica: ProductReplica,
    generation: number,
    initialJoin: boolean,
    options: ProductSyncOptions = {}
  ): Promise<void> {
    ++this.captureVersion;
    await this.port.checkpoint();
    if (!this.current(generation)) return;
    const snapshot = await this.port.snapshot(await replica.records());
    if (!this.current(generation)) return;
    if (!initialJoin) await replica.capture(snapshot.entries, snapshot.localWorkIds);
    const result = await replica.synchronize(this.apply(snapshot, generation), options);
    if (this.current(generation)) this.accept(result);
  }

  private apply(snapshot: ProductSnapshot, generation: number, force?: Set<string>): ApplyProductSync {
    return async result => {
      if (!this.current(generation)) return [];
      await this.port.project(
        result.records,
        new Set(result.conflicts.map(conflict => conflict.recordId)),
        snapshot.versions,
        force
      );
      return this.current(generation) ? (await this.port.snapshot(result.records)).entries : [];
    };
  }

  private async open(
    access: ProductAuthorization,
    workspaceId: string,
    generation: number
  ): Promise<ProductReplica | undefined> {
    const profile = this.port.profile();
    if (!profile || !this.current(generation)) return;
    if (this.replica && this.openedProfileId === profile.id) return this.replica;
    this.connection = new AbortController();
    const replica = await this.factory(profile.id, workspaceId, access, this.connection.signal);
    if (!this.current(generation) || this.port.profile()?.id !== profile.id) {
      await replica.close();
      return;
    }
    this.replica = replica;
    this.openedProfileId = profile.id;
    return replica;
  }

  private async capture(version: number, generation: number): Promise<void> {
    const replica = this.replica;
    if (!replica || !this.current(generation) || this.frame.value.busy || this.port.busy()) return;
    try {
      const snapshot = await this.port.snapshot(await replica.records());
      if (!this.current(generation) || version !== this.captureVersion || this.frame.value.busy) return;
      const changed = await replica.capture(snapshot.entries, snapshot.localWorkIds),
        conflicts = await replica.conflicts();
      if (this.current(generation))
        this.publish({
          conflicts,
          ...(conflicts.length ? { status: 'conflict' }
          : changed ? { status: 'pending' }
          : {})
        });
    } catch {
      if (this.current(generation)) this.fail();
    }
  }

  private accountMatches(access: ProductAuthorization, account: WorkspaceAccount): void {
    if (access.userId !== account.userId || access.config.url !== account.projectOrigin)
      throw new Error('当前同步账号已变化。');
  }
  private accept(result: ProductSyncResult): void {
    console.log(
      '[media-sync] accepted',
      JSON.stringify({ pending: result.pending, conflicts: result.conflicts.length })
    );
    this.publish({
      status:
        result.conflicts.length ? 'conflict'
        : result.pending ? 'pending'
        : 'synced',
      conflicts: result.conflicts,
      pending: result.pending,
      draftDeleted: result.records.some(
        record => record.kind === 'draft' && record.sourceId === 'main' && record.deleted
      ),
      message: result.conflicts.length ? '双方修订已保留；冲突记录暂停，其它内容可继续同步。' : ''
    });
  }
  private current(generation: number): boolean {
    return !this.closed && generation === this.generation;
  }
  private publish(update: Partial<ProductWorkspaceState>): void {
    if (!this.closed) this.frame.next({ ...this.frame.value, ...update });
  }
  private fail(): void {
    this.publish({ status: 'failed', message: '同步操作未确认，本机内容和未确认改动保留。请重试或重新验证当前账号。' });
  }
}
