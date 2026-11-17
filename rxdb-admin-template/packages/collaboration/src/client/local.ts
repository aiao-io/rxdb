import { diffRecords } from '../changes.js';
import { sealCommit, uuidv7 } from '../commit.js';
import { demand, receiptRetentionMs, type Command, type Commit, type Records, type SchemaManifest } from '../model.js';
import { canonical } from '../records.js';
import { namespaceOf } from '../schema.js';
export interface Context {
  userId: string;
  teamId: string;
  appId: string;
  taskId: string;
}
/**
 * 待上传的一个整单提交及其幂等键。`createdAt` 是它在本机形成的时间，只用于判断是否还能自动重试，不随请求发出；
 * 切片 D 之前写入的条目没有这个字段，无法证明仍在回执保留期内，按已超过自动重试期限处理。
 */
export interface PendingUpload {
  operationId: string;
  expectedHead: string | null;
  commits: Commit[];
  createdAt?: number;
}
/**
 * 本机自动重试待确认请求的期限：比服务端回执保留期（{@link receiptRetentionMs}）早一天停止，
 * 给本机与服务端的时钟偏差留出余量；超过后服务端可能已清理回执，无法再用原幂等键确认结果，交给用户确认。
 */
export const autoRetryWindowMs = receiptRetentionMs - 86_400_000;
/** 首次发出（或形成）于 `createdAt` 的请求是否已超过自动重试期限；没有有效时间的按已超过处理。 */
export function retryWindowPassed(createdAt: number | undefined, now = Date.now()): boolean {
  return createdAt === undefined || !Number.isFinite(createdAt) || now - createdAt >= autoRetryWindowMs;
}
/** 把待上传条目还原成上传命令：只取命令字段，本机记账用的 `createdAt` 不随请求发出（服务端拒绝多余字段）。 */
export function uploadCommand(taskId: string, pending: PendingUpload): Extract<Command, { type: 'upload' }> {
  return {
    type: 'upload',
    taskId,
    operationId: pending.operationId,
    expectedHead: pending.expectedHead,
    commits: pending.commits
  };
}
/**
 * 本机任务草稿。`schema` 是最近一次联网打开任务时工作区的数据模式清单：编辑器按它渲染，
 * 形成提交时按它填写字段级变更的命名空间；离线打开时同样用它。
 */
export interface Draft {
  context: Context;
  schema: SchemaManifest;
  name: string;
  base: string | null;
  remoteHead: string | null;
  localHead: string | null;
  records: Records;
  committed: Records;
  revision: number;
  queue: PendingUpload[];
  locked: boolean;
  verifiedAt: number;
  forkArchive?: { taskId: string; head: string };
}
export const contextKey = (context: Context) =>
  JSON.stringify([context.userId, context.teamId, context.appId, context.taskId]);

/** 原子读改写单个任务，保存、提交和回执使用同一持久化边界。 */
export interface DraftStorage {
  read(key: string): Promise<Draft | undefined>;
  write(key: string, change: (current: Draft | undefined) => Draft): Promise<Draft>;
  list(userId: string): Promise<Draft[]>;
  lock(userId: string): Promise<void>;
  dispose?(): void;
}
export class IndexedDraftStorage implements DraftStorage {
  private closed = false;
  private readonly databases = new Map<string, Promise<IDBDatabase>>();
  private readonly index: Promise<IDBDatabase>;
  constructor(private readonly name = 'rxdb-admin-collaboration-v1') {
    this.index = this.open(`${name}:contexts`, database => {
      database.createObjectStore('contexts', { keyPath: 'key' }).createIndex('userId', 'userId');
    });
  }
  async read(key: string) {
    const database = await this.database(key);
    return new Promise<Draft | undefined>((resolve, reject) => {
      const request = database.transaction('drafts', 'readonly').objectStore('drafts').get(key);
      request.onsuccess = () => resolve(request.result as Draft | undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async write(key: string, change: (current: Draft | undefined) => Draft): Promise<Draft> {
    await this.register(key);
    const database = await this.database(key);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('drafts', 'readwrite');
      const store = transaction.objectStore('drafts');
      const request = store.get(key);
      let result: Draft;
      let failure: unknown;
      request.onsuccess = () => {
        try {
          result = change(request.result as Draft | undefined);
          demand(contextKey(result.context) === key, 'invalid', '本地上下文不匹配');
          store.put(result, key);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(structuredClone(result));
      transaction.onabort = () => reject(failure ?? transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }
  async list(userId: string): Promise<Draft[]> {
    const database = await this.index;
    const contexts = await new Promise<{ key: string }[]>((resolve, reject) => {
      const request = database
        .transaction('contexts', 'readonly')
        .objectStore('contexts')
        .index('userId')
        .getAll(userId);
      request.onsuccess = () => resolve(request.result as { key: string }[]);
      request.onerror = () => reject(request.error);
    });
    const drafts = await Promise.all(contexts.map(context => this.read(context.key)));
    return drafts.filter((draft): draft is Draft => draft !== undefined && draft.context.userId === userId);
  }
  async lock(userId: string): Promise<void> {
    const drafts = await this.list(userId);
    await Promise.all(
      drafts.map(draft =>
        this.write(contextKey(draft.context), current => {
          demand(current, 'missing', '任务不存在');
          return { ...current, locked: true };
        })
      )
    );
  }
  dispose(): void {
    this.closed = true;
    void Promise.allSettled([this.index, ...this.databases.values()].map(async pending => (await pending).close()));
    this.databases.clear();
  }
  private database(key: string): Promise<IDBDatabase> {
    demand(!this.closed, 'cancelled', '页面已关闭');
    let database = this.databases.get(key);
    if (!database) {
      database = this.open(`${this.name}:${key}`, db => {
        db.createObjectStore('drafts');
      });
      this.databases.set(key, database);
    }
    return database;
  }
  private open(name: string, upgrade: (database: IDBDatabase) => void): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  private async register(key: string): Promise<void> {
    const [userId] = JSON.parse(key) as string[];
    const database = await this.index;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('contexts', 'readwrite');
      transaction.objectStore('contexts').put({ key, userId });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

/** 缓存授权仅用于本机解锁；每次云端操作仍由服务端重新校验。 */
export class LocalTasks {
  private userId: string | null = null;
  private readonly unlocked = new Set<string>();
  private generation = 0;
  get epoch() {
    return this.generation;
  }
  get actor() {
    return this.userId;
  }
  constructor(readonly storage: DraftStorage) {}
  async login(userId: string): Promise<void> {
    if (this.userId && this.userId !== userId) await this.logout();
    this.userId = userId;
  }
  async coldRestore(userId: string, expiresAt: number, now: number): Promise<Draft[]> {
    await this.login(userId);
    const epoch = this.generation;
    demand(expiresAt > now, 'locked', '会话已过期，请联网登录');
    const drafts = (await this.storage.list(userId)).filter(draft => !draft.locked && draft.verifiedAt > 0);
    demand(epoch === this.generation && userId === this.userId, 'cancelled', '上下文已切换');
    drafts.forEach(draft => this.unlocked.add(contextKey(draft.context)));
    return drafts;
  }
  /**
   * 联网验证后打开（或新建）任务草稿：已有草稿只解锁并换上当前的数据模式清单，内容保持原样；没有时以 `records` 新建。
   */
  async openVerified(
    context: Context,
    name: string,
    base: string | null,
    head: string | null,
    records: Records,
    schema: SchemaManifest
  ): Promise<Draft> {
    demand(context.userId === this.userId, 'locked', '账号不匹配');
    const epoch = this.generation;
    const key = contextKey(context);
    const draft = await this.storage.write(key, previous => {
      demand(epoch === this.generation && context.userId === this.userId, 'cancelled', '上下文已切换');
      return previous ?
          { ...previous, schema: structuredClone(schema), locked: false, verifiedAt: Date.now() }
        : {
            context,
            schema: structuredClone(schema),
            name,
            base,
            remoteHead: head,
            localHead: head,
            records: structuredClone(records),
            committed: structuredClone(records),
            revision: 0,
            queue: [],
            locked: false,
            verifiedAt: Date.now()
          };
    });
    demand(this.generation === epoch, 'locked', '账号已切换');
    this.unlocked.add(key);
    return draft;
  }
  async read(context: Context) {
    this.assert(context);
    return this.storage.read(contextKey(context));
  }
  async save(context: Context, records: Records, expectedRevision: number): Promise<Draft> {
    this.assert(context);
    const epoch = this.generation;
    return this.storage.write(contextKey(context), current => {
      this.assert(context, epoch);
      demand(current && current.revision === expectedRevision, 'stale', '其他页面已修改草稿，请保留输入后重新打开');
      return { ...current, records: structuredClone(records), revision: current.revision + 1 };
    });
  }
  /**
   * 把已保存、尚未提交的内容形成一个不可变提交并加入待上传队列。提交只含「上次提交的内容」到「当前已保存内容」之间逐字段的
   * 差异（字段级变更），带 UUIDv7 提交 ID 与内容指纹；没有差异时不制造空提交，已有待上传提交时原样保留，重试复用同一提交。
   * 新条目记下形成时间 `createdAt`，超过自动重试期限后由控制器交给用户确认。
   * 指纹用异步的 `crypto.subtle` 计算，不能放进 IndexedDB 事务回调，所以先读草稿再算提交，写入时用修订号确认期间没有被其他页面改动。
   */
  async capture(context: Context, message: string, unsaved: boolean): Promise<Draft> {
    this.assert(context);
    demand(!unsaved, 'unsaved', '请先保存全部输入，或取消同步');
    const epoch = this.generation;
    const key = contextKey(context);
    const read = await this.storage.read(key);
    demand(read, 'missing', '任务不存在');
    this.assert(context, epoch);
    if (canonical(read.records) === canonical(read.committed)) return read;
    const commit = await sealCommit({
      id: uuidv7(),
      parent: read.localHead,
      authorId: context.userId,
      message,
      changes: diffRecords(read.committed, read.records, namespaceOf(read.schema))
    });
    return this.storage.write(key, current => {
      this.assert(context, epoch);
      demand(current && current.revision === read.revision, 'stale', '其他页面已修改草稿，请保留输入后重新打开');
      return {
        ...current,
        localHead: commit.id,
        committed: structuredClone(current.records),
        revision: current.revision + 1,
        queue: [
          ...current.queue,
          { operationId: crypto.randomUUID(), expectedHead: commit.parent, commits: [commit], createdAt: Date.now() }
        ]
      };
    });
  }
  async acknowledge(context: Context, operationId: string, head: string, epoch: number): Promise<Draft> {
    this.assert(context, epoch);
    return this.storage.write(contextKey(context), current => {
      this.assert(context, epoch);
      demand(current && current.queue[0]?.operationId === operationId, 'stale', '同步队列已变化');
      demand(current.queue[0].commits.at(-1)?.id === head, 'invalid', '服务端回执与提交不一致');
      return { ...current, remoteHead: head, queue: current.queue.slice(1), revision: current.revision + 1 };
    });
  }
  async archiveFork(context: Context, taskId: string, head: string): Promise<void> {
    this.assert(context);
    const epoch = this.generation;
    await this.storage.write(contextKey(context), current => {
      this.assert(context, epoch);
      demand(current, 'missing', '任务不存在');
      return { ...current, forkArchive: { taskId, head } };
    });
  }
  async fastForward(context: Context, head: string | null, records: Records, unsaved: boolean): Promise<Draft> {
    this.assert(context);
    const epoch = this.generation;
    return this.storage.write(contextKey(context), current => {
      this.assert(context, epoch);
      demand(
        current &&
          !unsaved &&
          (!current.queue.length || current.forkArchive?.head === current.localHead) &&
          canonical(current.records) === canonical(current.committed),
        'dirty',
        '本机有修改，请先保留或另存为新任务'
      );
      return {
        ...current,
        localHead: head,
        remoteHead: head,
        queue: [],
        records: structuredClone(records),
        committed: structuredClone(records),
        revision: current.revision + 1
      };
    });
  }
  dispose(): void {
    this.userId = null;
    this.unlocked.clear();
    this.generation++;
    this.storage.dispose?.();
  }
  async logout(): Promise<void> {
    const userId = this.userId;
    this.userId = null;
    this.unlocked.clear();
    this.generation++;
    if (userId) await this.storage.lock(userId);
  }
  assert(context: Context, epoch = this.generation): void {
    demand(
      this.userId === context.userId && this.unlocked.has(contextKey(context)) && epoch === this.generation,
      'locked',
      '团队草稿已锁定，请重新验证身份与权限'
    );
  }
}
