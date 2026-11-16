import { demand, type Commit, type Records } from '../model.js';
import { canonical } from '../records.js';
export interface Context {
  userId: string;
  teamId: string;
  appId: string;
  taskId: string;
}
export interface PendingUpload {
  operationId: string;
  expectedHead: string | null;
  commits: Commit[];
}
export interface Draft {
  context: Context;
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
  async openVerified(
    context: Context,
    name: string,
    base: string | null,
    head: string | null,
    records: Records
  ): Promise<Draft> {
    demand(context.userId === this.userId, 'locked', '账号不匹配');
    const epoch = this.generation;
    const key = contextKey(context);
    const draft = await this.storage.write(key, previous => {
      demand(epoch === this.generation && context.userId === this.userId, 'cancelled', '上下文已切换');
      return previous ?
          { ...previous, locked: false, verifiedAt: Date.now() }
        : {
            context,
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
  async capture(context: Context, message: string, unsaved: boolean): Promise<Draft> {
    this.assert(context);
    demand(!unsaved, 'unsaved', '请先保存全部输入，或取消同步');
    const epoch = this.generation;
    return this.storage.write(contextKey(context), current => {
      this.assert(context, epoch);
      demand(current, 'missing', '任务不存在');
      if (canonical(current.records) === canonical(current.committed)) return current;
      const commit: Commit = {
        id: crypto.randomUUID(),
        parent: current.localHead,
        authorId: context.userId,
        message,
        records: structuredClone(current.records)
      };
      return {
        ...current,
        localHead: commit.id,
        committed: structuredClone(current.records),
        revision: current.revision + 1,
        queue: [...current.queue, { operationId: crypto.randomUUID(), expectedHead: commit.parent, commits: [commit] }]
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
