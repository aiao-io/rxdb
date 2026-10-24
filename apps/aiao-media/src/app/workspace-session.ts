import {
  WorkspaceRegistry,
  type WorkspaceAccount,
  type WorkspaceBinding,
  type WorkspaceProfile,
  type WorkspaceRegistryState
} from '../local-data/workspace-registry';

export interface WorkspaceSessionPort<T> {
  checkpoint(): Promise<void>;
  pause(): void;
  open(profileId: string): Promise<T>;
  activate(store: T, profile: WorkspaceProfile): void;
  discard(store: T): Promise<void>;
  selected(state: WorkspaceRegistryState): void | Promise<void>;
  transition?(active: boolean): void;
  canActivate?(profile: WorkspaceProfile): boolean;
}

/** 按顺序切换本机副本，过期打开结果不能进入当前页面。 */
export class WorkspaceSession<T> {
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(
    private currentId: string,
    private readonly registry: WorkspaceRegistry,
    private readonly port: WorkspaceSessionPort<T>
  ) {}

  select(account: WorkspaceAccount | null): Promise<void | undefined> {
    return this.run(async generation => {
      await this.port.checkpoint();
      if (!this.current(generation)) return;
      await this.activate(await this.registry.selectAccount(account), generation);
    });
  }

  bind(account: WorkspaceAccount, newCopy: boolean): Promise<WorkspaceBinding | undefined> {
    return this.run(async generation => {
      await this.port.checkpoint();
      if (!this.current(generation)) return;
      const binding = await this.registry.prepareBinding(account, newCopy);
      await this.activate(await this.registry.read(), generation);
      return this.current(generation) ? binding : undefined;
    });
  }

  selectLocal(profileId: string): Promise<void | undefined> {
    return this.run(async generation => {
      await this.port.checkpoint();
      if (!this.current(generation)) return;
      const state = await this.registry.read();
      await this.registry.selectProfile(profileId, state.generation);
      await this.activate(await this.registry.read(), generation);
    });
  }

  follow(): Promise<void | undefined> {
    return this.run(async generation => {
      await this.port.checkpoint();
      if (this.current(generation)) await this.activate(await this.registry.read(), generation);
    });
  }

  close(): void {
    this.closed = true;
    ++this.generation;
    this.port.pause();
  }

  private async activate(state: WorkspaceRegistryState, generation: number): Promise<void> {
    if (!this.current(generation)) return;
    const profile = state.profiles.find(item => item.id === state.selectedId);
    if (!profile) throw new Error('工作区目录已变化。');
    if (state.selectedId !== this.currentId) {
      if (this.port.canActivate && !this.port.canActivate(profile)) {
        await this.port.selected(state);
        return;
      }
      const store = await this.port.open(state.selectedId);
      if (!this.current(generation)) return this.port.discard(store);
      const latest = await this.registry.read();
      if (!this.current(generation)) return this.port.discard(store);
      if (latest.selectedId !== state.selectedId) {
        await this.port.discard(store);
        return this.activate(latest, generation);
      }
      const selected = latest.profiles.find(item => item.id === latest.selectedId);
      if (!selected) {
        await this.port.discard(store);
        throw new Error('工作区目录已变化。');
      }
      if (this.port.canActivate && !this.port.canActivate(selected)) {
        await this.port.discard(store);
        await this.port.selected(latest);
        return;
      }
      this.port.activate(store, selected);
      this.currentId = state.selectedId;
      state = latest;
    }
    await this.port.selected(state);
  }

  private run<R>(operation: (generation: number) => Promise<R>): Promise<R | undefined> {
    const generation = ++this.generation;
    this.port.transition?.(true);
    this.port.pause();
    const task = this.queue.then(() => (this.current(generation) ? operation(generation) : undefined));
    const finished = task.finally(() => this.port.transition?.(false));
    this.queue = finished.then(
      () => undefined,
      () => undefined
    );
    return finished;
  }

  private current(generation: number): boolean {
    return !this.closed && generation === this.generation;
  }
}
