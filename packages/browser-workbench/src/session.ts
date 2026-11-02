import { assertGitPath, assertNoPathCollisions } from './git/git-paths.js';

/** 工作区的普通文件；二进制内容不会被编辑器隐式转码。 */
export type WorkspaceFiles = Readonly<Record<string, string | Uint8Array>>;

/** 一次已持久化的项目快照。 */
export interface WorkspaceSnapshot {
  readonly projectId: string;
  readonly revision: string;
  readonly files: WorkspaceFiles;
}

/** Git 的 index 与工作区状态。 */
export interface WorkspaceStatus {
  readonly branch: string;
  readonly head: string | null;
  readonly entries: readonly { readonly path: string; readonly index: string; readonly worktree: string }[];
}

/** 一个可达 Git 提交。 */
export interface WorkspaceCommit {
  readonly oid: string;
  readonly message: string;
}

/** Git Worker 对工作台暴露的文件与版本管理入口。 */
export interface WorkspaceBackend {
  open(projectId: string): Promise<WorkspaceSnapshot>;
  create(projectId: string, files: WorkspaceFiles): Promise<WorkspaceSnapshot>;
  save(projectId: string, files: WorkspaceFiles, expectedRevision: string): Promise<WorkspaceSnapshot>;
  remove(projectId: string, path: string): Promise<void>;
  rename(projectId: string, from: string, to: string): Promise<void>;
  status(projectId: string): Promise<WorkspaceStatus>;
  stage(projectId: string, paths: readonly string[]): Promise<void>;
  commit(projectId: string, message: string): Promise<string>;
  history(projectId: string): Promise<readonly WorkspaceCommit[]>;
  restore(projectId: string, oid: string): Promise<WorkspaceSnapshot>;
  exportArchive(projectId: string): Promise<Uint8Array>;
  importArchive(projectId: string, bytes: Uint8Array): Promise<void>;
  dispose(): void;
}

/** 可注入的编译输出。 */
export interface WorkbenchCompilation {
  readonly js: string;
  readonly css: string;
  readonly html?: string;
}

/** 已编译预览对应的项目与文件版本。 */
export interface WorkbenchPreview extends WorkbenchCompilation {
  readonly projectId: string;
  readonly revision: string;
  readonly runId: number;
}

/** 工作台的可订阅状态。 */
export interface WorkbenchState {
  readonly projectId: string | null;
  readonly revision: string | null;
  readonly files: WorkspaceFiles;
  readonly activePath: string | null;
  readonly tabs: readonly string[];
  readonly dirty: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly preview: WorkbenchPreview | null;
}

const initialState: WorkbenchState = {
  projectId: null,
  revision: null,
  files: {},
  activePath: null,
  tabs: [],
  dirty: false,
  busy: false,
  error: null,
  preview: null
};

const errorMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
const equalFile = (left: string | Uint8Array | undefined, right: string | Uint8Array | undefined): boolean => {
  if (left === right) return true;
  if (typeof left === 'string' || typeof right === 'string' || !left || !right) return false;
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
};
const equalFiles = (left: WorkspaceFiles, right: WorkspaceFiles): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.keys(left).every(path => equalFile(left[path], right[path]));

/** 管理编辑缓冲、真实保存回执和编译代次，三端共用。 */
export class WorkbenchSession {
  #state: WorkbenchState = initialState;
  #saved: WorkspaceFiles = {};
  #listeners = new Set<(state: WorkbenchState) => void>();
  #generation = 0;
  #runId = 0;
  #closed = false;
  #savePending: Promise<void> | null = null;
  #pendingWork = new Map<symbol, number>();

  get state(): WorkbenchState {
    return this.#state;
  }

  constructor(readonly backend: WorkspaceBackend) {}

  subscribe(listener: (state: WorkbenchState) => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  async open(projectId: string): Promise<void> {
    return this.#transition(() => this.backend.open(projectId));
  }

  async create(projectId: string, files: WorkspaceFiles): Promise<void> {
    return this.#transition(() => this.backend.create(projectId, files));
  }

  select(path: string): void {
    this.#assertOpen();
    if (!(path in this.#state.files)) throw new Error('文件不存在');
    const tabs = this.#state.tabs.includes(path) ? this.#state.tabs : [...this.#state.tabs, path];
    this.#update({ activePath: path, tabs });
  }

  closeTab(path: string): void {
    this.#assertOpen();
    const tabs = this.#state.tabs.filter(item => item !== path);
    this.#update({
      tabs,
      activePath: this.#state.activePath === path ? (tabs.at(-1) ?? null) : this.#state.activePath
    });
  }

  edit(path: string, content: string): void {
    this.#assertOpen();
    assertGitPath(path);
    const files = { ...this.#state.files, [path]: content };
    assertNoPathCollisions(Object.keys(files));
    this.#update({ files, dirty: !equalFiles(files, this.#saved), error: null });
  }

  discard(): void {
    this.#assertOpen();
    this.#update({ files: { ...this.#saved }, dirty: false, error: null });
  }

  save(): Promise<void> {
    this.#assertOpen();
    if (this.#savePending) return this.#savePending;
    const pending = this.#performSave();
    this.#savePending = pending;
    void pending
      .finally(() => {
        if (this.#savePending === pending) this.#savePending = null;
      })
      .catch(() => undefined);
    return pending;
  }

  async run(compile: (snapshot: WorkspaceSnapshot) => Promise<WorkbenchCompilation>): Promise<void> {
    const projectId = this.#project();
    const generation = this.#generation;
    const runId = ++this.#runId;
    await this.save();
    if (!this.#current(generation) || runId !== this.#runId) return;
    if (this.#state.dirty) throw new Error('保存期间内容发生变化，请重新运行');
    const revision = this.#state.revision;
    if (!revision) throw new Error('项目尚未保存');
    const release = this.#beginWork(generation);
    this.#update({ error: null });
    try {
      const result = await compile({ projectId, revision, files: { ...this.#saved } });
      if (!this.#current(generation) || runId !== this.#runId) return;
      this.#update({ preview: { ...result, projectId, revision, runId } });
    } catch (cause) {
      if (this.#current(generation) && runId === this.#runId) this.#update({ error: errorMessage(cause) });
      throw cause;
    } finally {
      release();
    }
  }

  async restore(oid: string): Promise<void> {
    const projectId = this.#project();
    return this.#transition(() => this.backend.restore(projectId, oid));
  }

  async remove(path: string): Promise<void> {
    const projectId = this.#project();
    return this.#transition(async () => {
      await this.backend.remove(projectId, path);
      return this.backend.open(projectId);
    });
  }

  async rename(from: string, to: string): Promise<void> {
    const projectId = this.#project();
    return this.#transition(async () => {
      await this.backend.rename(projectId, from, to);
      return this.backend.open(projectId);
    });
  }

  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#generation++;
    this.#runId++;
    this.#pendingWork.clear();
    this.#listeners.clear();
    this.backend.dispose();
  }

  async #performSave(): Promise<void> {
    const projectId = this.#project();
    const revision = this.#state.revision;
    if (!this.#state.dirty || !revision) return;
    const files = { ...this.#state.files };
    const generation = this.#generation;
    const release = this.#beginWork(generation);
    this.#update({ error: null });
    try {
      const result = await this.backend.save(projectId, files, revision);
      if (!this.#current(generation)) return;
      this.#saved = result.files;
      this.#update({ revision: result.revision, dirty: !equalFiles(this.#state.files, result.files) });
    } catch (cause) {
      if (this.#current(generation)) this.#update({ error: errorMessage(cause) });
      throw cause;
    } finally {
      release();
    }
  }

  async #transition(operation: () => Promise<WorkspaceSnapshot>): Promise<void> {
    this.#assertClean();
    const generation = ++this.#generation;
    this.#runId++;
    this.#savePending = null;
    const release = this.#beginWork(generation);
    this.#update({ error: null });
    try {
      const snapshot = await operation();
      if (!this.#current(generation)) return;
      if (this.#state.dirty) throw new Error('操作期间内容发生变化，请先保存或显式丢弃编辑缓冲');
      this.#replace(snapshot);
    } catch (cause) {
      if (this.#current(generation)) this.#update({ error: errorMessage(cause) });
      throw cause;
    } finally {
      release();
    }
  }

  #beginWork(generation: number): () => void {
    const token = Symbol();
    this.#pendingWork.set(token, generation);
    this.#update({ busy: true });
    return () => {
      this.#pendingWork.delete(token);
      if (this.#current(generation)) this.#update({ busy: [...this.#pendingWork.values()].includes(generation) });
    };
  }

  #project(): string {
    this.#assertOpen();
    if (!this.#state.projectId) throw new Error('请先打开项目');
    return this.#state.projectId;
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('工作台已关闭');
  }

  #assertClean(): void {
    this.#assertOpen();
    if (this.#state.dirty) throw new Error('存在未保存内容，请先保存或显式丢弃');
  }

  #current(generation: number): boolean {
    return !this.#closed && generation === this.#generation;
  }

  #replace(snapshot: WorkspaceSnapshot): void {
    this.#saved = snapshot.files;
    const activePath =
      Object.keys(snapshot.files).find(path => /^(src\/)?(main|App)\./.test(path)) ??
      Object.keys(snapshot.files)[0] ??
      null;
    this.#update({
      ...snapshot,
      activePath,
      tabs: activePath ? [activePath] : [],
      dirty: false,
      error: null,
      preview: null
    });
  }

  #update(update: Partial<WorkbenchState>): void {
    this.#state = { ...this.#state, ...update };
    this.#listeners.forEach(listener => listener(this.#state));
  }
}
