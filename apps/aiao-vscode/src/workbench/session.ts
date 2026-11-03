import { assertGitPath, assertNoPathCollisions } from './git/git-paths.js';

/** 工作区的普通文件；二进制内容不会被编辑器隐式转码。 */
export type WorkbenchFiles = Readonly<Record<string, string | Uint8Array>>;

/** 一次已持久化的项目快照。 */
export interface WorkbenchSnapshot {
  readonly projectId: string;
  readonly revision: string;
  readonly files: WorkbenchFiles;
}

/** Git 的 index 与工作区状态。 */
export interface WorkbenchStatus {
  readonly branch: string;
  readonly head: string | null;
  readonly entries: readonly {
    readonly path: string;
    readonly originalPath?: string;
    readonly index: string;
    readonly worktree: string;
  }[];
}

/** 差异一侧的精确文本或二进制说明。 */
export interface WorkbenchFileVersion {
  readonly exists: boolean;
  readonly binary: boolean;
  readonly text: string | null;
  readonly byteLength: number;
}

/** Git 暂存区或工作区的双侧差异。 */
export interface WorkbenchDiff {
  readonly projectId: string;
  readonly path: string;
  readonly kind: 'working' | 'staged';
  readonly base: WorkbenchFileVersion;
  readonly modified: WorkbenchFileVersion;
}

/** 一个可达 Git 提交。 */
export interface WorkbenchCommit {
  readonly oid: string;
  readonly message: string;
}

/** Git Worker 对工作台暴露的文件与版本管理入口。 */
export interface WorkbenchBackend {
  open(projectId: string): Promise<WorkbenchSnapshot>;
  create(projectId: string, files: WorkbenchFiles): Promise<WorkbenchSnapshot>;
  save(projectId: string, files: WorkbenchFiles, expectedRevision: string): Promise<WorkbenchSnapshot>;
  remove(projectId: string, path: string): Promise<void>;
  rename(projectId: string, from: string, to: string): Promise<void>;
  status(projectId: string): Promise<WorkbenchStatus>;
  stage(projectId: string, paths: readonly string[]): Promise<void>;
  unstage(projectId: string, paths: readonly string[]): Promise<void>;
  readDiff(projectId: string, path: string, kind: 'working' | 'staged'): Promise<WorkbenchDiff>;
  discardWorking(projectId: string, path: string): Promise<WorkbenchSnapshot>;
  commit(projectId: string, message: string): Promise<string>;
  history(projectId: string): Promise<readonly WorkbenchCommit[]>;
  restore(projectId: string, oid: string): Promise<WorkbenchSnapshot>;
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
  readonly files: WorkbenchFiles;
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
const fileEncoder = new TextEncoder();
const equalFile = (left: string | Uint8Array | undefined, right: string | Uint8Array | undefined): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (typeof left === 'string' && typeof right === 'string') return false;
  const leftBytes = typeof left === 'string' ? fileEncoder.encode(left) : left;
  const rightBytes = typeof right === 'string' ? fileEncoder.encode(right) : right;
  return leftBytes.length === rightBytes.length && leftBytes.every((byte, index) => byte === rightBytes[index]);
};
const equalFiles = (left: WorkbenchFiles, right: WorkbenchFiles): boolean =>
  Object.keys(left).length === Object.keys(right).length &&
  Object.keys(left).every(path => equalFile(left[path], right[path]));

/** 管理编辑缓冲、真实保存回执和编译代次，三端共用。 */
export class WorkbenchSession {
  #state: WorkbenchState = initialState;
  #saved: WorkbenchFiles = {};
  #listeners = new Set<(state: WorkbenchState) => void>();
  #generation = 0;
  #runId = 0;
  #closed = false;
  #savePending: Promise<void> | null = null;
  #saveTarget = '*';
  #pendingWork = new Map<symbol, number>();

  get state(): WorkbenchState {
    return this.#state;
  }

  constructor(readonly backend: WorkbenchBackend) {}

  subscribe(listener: (state: WorkbenchState) => void): () => void {
    this.#assertOpen();
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  /** 某个文件的编辑缓冲是否包含未保存修改。 */
  isModified(path: string): boolean {
    return !equalFile(this.#state.files[path], this.#saved[path]);
  }

  async open(projectId: string): Promise<void> {
    return this.#transition(() => this.backend.open(projectId));
  }

  async create(projectId: string, files: WorkbenchFiles): Promise<void> {
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

  save(paths?: readonly string[]): Promise<void> {
    this.#assertOpen();
    const selected = paths ? [...new Set(paths)] : undefined;
    const target = selected ? JSON.stringify([...selected].sort()) : '*';
    if (this.#savePending) {
      const generation = this.#generation;
      const projectId = this.#state.projectId;
      return target === this.#saveTarget ?
          this.#savePending
        : this.#savePending.then(() => {
            if (!this.#current(generation) || this.#state.projectId !== projectId) return;
            return this.save(selected);
          });
    }
    const pending = this.#performSave(selected);
    this.#saveTarget = target;
    this.#savePending = pending;
    void pending
      .finally(() => {
        if (this.#savePending === pending) this.#savePending = null;
      })
      .catch(() => undefined);
    return pending;
  }

  /** 让在途编译失效，保留上次成功的预览。 */
  cancelRun(): void {
    this.#assertOpen();
    this.#runId++;
  }

  /** 合并磁盘操作的回执，指定路径接受丢弃，其余未保存缓冲继续保留。 */
  applySavedSnapshot(snapshot: WorkbenchSnapshot, overwrittenPaths: readonly string[]): void {
    this.#assertOpen();
    if (snapshot.projectId !== this.#state.projectId) throw new Error('不能应用其他项目的文件回执');
    const overwritten = new Set(overwrittenPaths);
    const files: Record<string, string | Uint8Array> = { ...snapshot.files };
    for (const [path, value] of Object.entries(this.#state.files)) {
      if (!overwritten.has(path) && !equalFile(value, this.#saved[path])) files[path] = value;
    }
    this.#generation++;
    this.#runId++;
    this.#savePending = null;
    this.#saved = snapshot.files;
    const tabs = this.#state.tabs.filter(path => Object.hasOwn(files, path));
    const activePath =
      this.#state.activePath && Object.hasOwn(files, this.#state.activePath) ?
        this.#state.activePath
      : (tabs.at(-1) ?? null);
    this.#update({
      revision: snapshot.revision,
      files,
      tabs,
      activePath,
      dirty: !equalFiles(files, snapshot.files),
      busy: false,
      error: null
    });
  }

  async run(compile: (snapshot: WorkbenchSnapshot) => Promise<WorkbenchCompilation>): Promise<void> {
    this.#project();
    const generation = this.#generation;
    const runId = ++this.#runId;
    await this.save();
    if (!this.#current(generation) || runId !== this.#runId) return;
    if (this.#state.dirty) throw new Error('保存期间内容发生变化，请重新运行');
    return this.#publishSaved(compile, generation, runId);
  }

  /** 仅运行已保存的文件，不顺带持久化其它编辑缓冲。 */
  runSaved(compile: (snapshot: WorkbenchSnapshot) => Promise<WorkbenchCompilation>): Promise<void> {
    this.#project();
    return this.#publishSaved(compile, this.#generation, ++this.#runId);
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

  async #publishSaved(
    compile: (snapshot: WorkbenchSnapshot) => Promise<WorkbenchCompilation>,
    generation: number,
    runId: number
  ): Promise<void> {
    const projectId = this.#project();
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

  async #performSave(paths?: readonly string[]): Promise<void> {
    const projectId = this.#project();
    const revision = this.#state.revision;
    if (!this.#state.dirty || !revision) return;
    if (paths && !paths.some(path => this.isModified(path))) return;
    const files: Record<string, string | Uint8Array> = paths ? { ...this.#saved } : { ...this.#state.files };
    for (const path of paths ?? []) {
      if (!Object.hasOwn(this.#state.files, path)) throw new Error(`文件不存在：${path}`);
      files[path] = this.#state.files[path];
    }
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

  async #transition(operation: () => Promise<WorkbenchSnapshot>): Promise<void> {
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

  #replace(snapshot: WorkbenchSnapshot): void {
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
