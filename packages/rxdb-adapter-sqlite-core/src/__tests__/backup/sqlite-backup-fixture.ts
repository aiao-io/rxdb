/**
 * SQLite 备份 / 恢复共享套件的实体、流工具与后端契约（US-217 阶段 B）。
 *
 * @remarks
 * 本文件不 import vitest：恢复强杀用例要在 module Worker 里跑 {@link serveInterruptedRestore}，
 * Worker 里没有测试运行器。
 *
 * 源库与目标库在同一个页面里同时存在，实体类是模块级单例，所以每个实例都拿一份
 * {@link cloneEntityClasses} 的克隆；克隆保留元数据，两边算出的结构指纹一致。
 */
import {
  Entity,
  EntityBase,
  isRxDBBackupError,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  type EntityType
} from '@aiao/rxdb';
import { cloneEntityClasses } from '@aiao/rxdb/testing';
import { releaseProxy } from 'comlink';
import { releaseComlinkProxy, sqliteStorageLockName } from '../../index.js';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SqliteResult } from '../../sqlite-core.interface.js';
import type { SqliteClientLike } from '../../sqlite-core.types.js';
import type {
  RestoreInterruptPoint,
  RestoreInterruptReply,
  RestoreInterruptRequest,
  SqliteBackupHarness,
  SqliteBackupStorageKind
} from '../../testing.js';

// ─── 实体 ────────────────────────────────────────────────────────────────────

@Entity({
  name: 'BackupAuthor',
  properties: [{ name: 'name', type: PropertyType.string, unique: true }],
  relations: [{ name: 'notes', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'BackupNote', mappedProperty: 'author' }]
})
export class BackupAuthor extends EntityBase {
  name!: string;
}

@Entity({
  name: 'BackupNote',
  properties: [
    { name: 'title', type: PropertyType.string, sortable: true },
    { name: 'counter', type: PropertyType.bigint },
    { name: 'payload', type: PropertyType.binary, nullable: true },
    { name: 'publishedAt', type: PropertyType.date },
    { name: 'meta', type: PropertyType.json },
    { name: 'remark', type: PropertyType.string, nullable: true }
  ],
  relations: [
    {
      name: 'author',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BackupAuthor',
      mappedProperty: 'notes',
      nullable: true,
      onDelete: OnDeleteAction.SET_NULL
    }
  ]
})
export class BackupNote extends EntityBase {
  title!: string;
  counter!: bigint;
  payload!: Uint8Array | null;
  publishedAt!: Date;
  meta!: Record<string, unknown>;
  remark!: string | null;
  authorId!: string | null;
}

@Entity({
  name: 'BackupSecret',
  properties: [
    { name: 'label', type: PropertyType.string, sortable: true },
    { name: 'secret', type: PropertyType.string, encrypted: true }
  ]
})
export class BackupSecret extends EntityBase {
  label!: string;
  secret!: string;
}

/** 不含加密列的实体集合：认证域为 `null`，不同库名之间可以互相恢复。 */
export const PLAIN_ENTITIES: EntityType[] = [BackupAuthor, BackupNote];

/** 含加密列的实体集合：认证域就是库名。 */
export const ENCRYPTED_ENTITIES: EntityType[] = [BackupSecret];

/** 加密用例的口令。 */
export const BACKUP_PASSPHRASE = 'backup-restore-passphrase';

// ─── 实例 ────────────────────────────────────────────────────────────────────

/**
 * 每条用例一个库名，避免持久化存储在用例之间串库。
 *
 * @param prefix - 可读前缀
 * @returns 库名
 */
export const uniqueDbName = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 已注册 adapter、尚未连接的实例，连同它自己那份实体克隆。 */
export interface BackupRxDB {
  readonly rxdb: RxDB;
  readonly entities: EntityType[];
  /** 取出（必要时创建）尚未连接的 adapter；恢复要在它上面、在连接之前调用。 */
  adapter(): Promise<RxDBAdapterSqliteBase>;
  /** 连接并返回 adapter。 */
  connect(): Promise<RxDBAdapterSqliteBase>;
  /** 断开并释放后端资源；可重复调用。 */
  close(): Promise<void>;
}

/**
 * 造一个尚未连接的实例。
 *
 * @param harness - 后端
 * @param dbName - 库名
 * @param entities - 实体原型（会被克隆）
 * @param kind - 目标存储
 * @returns 实例、克隆后的实体与生命周期入口
 */
export const createBackupRxDB = (
  harness: SqliteBackupHarness,
  dbName: string,
  entities: EntityType[],
  kind: SqliteBackupStorageKind
): BackupRxDB => {
  const cloned = cloneEntityClasses(entities);
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'backup-user' },
    entities: cloned,
    sync: { local: { adapter: harness.adapterName }, type: SyncType.None }
  });
  rxdb.adapter(harness.adapterName, db => harness.createAdapter(db, kind));
  const adapter = async () => (await rxdb.getAdapter(harness.adapterName)) as RxDBAdapterSqliteBase;
  let closed = false;
  return {
    rxdb,
    entities: cloned,
    adapter,
    async connect() {
      const connected = await adapter();
      await rxdb.connect(harness.adapterName);
      return connected;
    },
    async close() {
      if (closed) return;
      closed = true;
      await rxdb.disconnectAll();
      await harness.release?.(rxdb);
    }
  };
};

/**
 * 把字节流恢复进实例配置的存储。
 *
 * @param target - 尚未连接的实例
 * @param source - 归档字节流
 * @param options - 取消信号与阶段回调
 * @returns 恢复结果
 */
export const restoreInto = async (
  target: BackupRxDB,
  source: ReadableStream<Uint8Array>,
  options?: Parameters<RxDBAdapterSqliteBase['restore']>[1]
) => (await target.adapter()).restore(source, options);

// ─── 流 ──────────────────────────────────────────────────────────────────────

/** 收集写入字节的输出流。 */
export interface CollectingSink {
  readonly sink: WritableStream<Uint8Array>;
  /** 每次 `write` 收到的块大小。 */
  readonly chunkSizes: number[];
  /** 已收到的全部字节。 */
  bytes(): Uint8Array;
  /** 是否被 close。 */
  closed(): boolean;
  /** 是否被 abort。 */
  aborted(): boolean;
}

/**
 * 拼接字节块。
 *
 * @param chunks - 字节块
 * @returns 拼接结果
 */
export const concatBytes = (chunks: readonly Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

/**
 * 造一个把所有块留在内存里的输出流。
 *
 * @param onWrite - 每块写入前回调，可用来注入失败或延迟
 * @returns 输出流与观测手段
 */
export const collectingSink = (
  onWrite?: (chunk: Uint8Array, index: number) => void | Promise<void>
): CollectingSink => {
  const chunks: Uint8Array[] = [];
  const chunkSizes: number[] = [];
  let isClosed = false;
  let isAborted = false;
  const sink = new WritableStream<Uint8Array>({
    async write(chunk) {
      await onWrite?.(chunk, chunks.length);
      chunks.push(chunk.slice());
      chunkSizes.push(chunk.byteLength);
    },
    close() {
      isClosed = true;
    },
    abort() {
      isAborted = true;
    }
  });
  return {
    sink,
    chunkSizes,
    bytes: () => concatBytes(chunks),
    closed: () => isClosed,
    aborted: () => isAborted
  };
};

/** {@link chunkedSource} 的观测手段。 */
export interface SourceProbe {
  /** 被消费方拉走的字节数。 */
  pulledBytes: number;
  /** 是否被 cancel。 */
  cancelled: boolean;
}

/**
 * 把字节按固定块大小变成可读流；按需拉取，便于观测消费方的背压。
 *
 * @param bytes - 归档字节
 * @param chunkSize - 块大小
 * @param onPull - 每块交出前回调（会被等待），参数是交出后的累计字节数；抛错会让流进入错误状态
 * @returns 可读流与观测手段
 */
export const chunkedSource = (
  bytes: Uint8Array,
  chunkSize = 16 * 1024,
  onPull?: (pulledBytes: number) => void | Promise<void>
): { stream: ReadableStream<Uint8Array>; probe: SourceProbe } => {
  const probe: SourceProbe = { pulledBytes: 0, cancelled: false };
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        const chunk = bytes.slice(offset, offset + chunkSize);
        offset += chunk.byteLength;
        probe.pulledBytes = offset;
        await onPull?.(offset);
        controller.enqueue(chunk);
      },
      cancel() {
        probe.cancelled = true;
      }
    },
    { highWaterMark: 0 }
  );
  return { stream, probe };
};

// ─── 种子数据 ────────────────────────────────────────────────────────────────

/** 种子数据里期望读回的笔记。 */
export interface SeededNote {
  readonly title: string;
  readonly counter: bigint;
  readonly payload: Uint8Array | null;
  readonly publishedAt: Date;
  readonly meta: Record<string, unknown>;
  readonly remark: string | null;
  readonly authorName: string | null;
}

/** 覆盖 bigint 边界、二进制、日期、JSON、空值与外键的种子数据。 */
export const SEEDED_NOTES: readonly SeededNote[] = [
  {
    title: 'a-first',
    counter: (1n << 63n) - 1n,
    payload: new Uint8Array([0, 1, 2, 255]),
    publishedAt: new Date('2026-01-02T03:04:05.678Z'),
    meta: { tags: ['x', 'y'], nested: { ok: true } },
    remark: '中文备注',
    authorName: 'alice'
  },
  {
    title: 'b-second',
    counter: -(1n << 63n),
    payload: null,
    publishedAt: new Date('2025-12-31T23:59:59.000Z'),
    meta: {},
    remark: null,
    authorName: null
  },
  {
    title: 'c-third',
    counter: 0n,
    payload: new Uint8Array(70_000).map((_, i) => i % 251),
    publishedAt: new Date('2000-02-29T00:00:00.000Z'),
    meta: { n: 1.5 },
    remark: '',
    authorName: 'alice'
  }
];

/**
 * 写入种子数据。
 *
 * @param entities - {@link createBackupRxDB} 返回的克隆（顺序同 {@link PLAIN_ENTITIES}）
 */
export const seedNotes = async (entities: EntityType[]): Promise<void> => {
  const [Author, Note] = entities as [typeof BackupAuthor, typeof BackupNote];
  const alice = new Author();
  alice.name = 'alice';
  await alice.save();
  for (const seed of SEEDED_NOTES) {
    const note = new Note();
    note.title = seed.title;
    note.counter = seed.counter;
    note.payload = seed.payload;
    note.publishedAt = seed.publishedAt;
    note.meta = seed.meta;
    note.remark = seed.remark;
    note.authorId = seed.authorName ? alice.id : null;
    await note.save();
  }
};

/**
 * 造一条只填必填字段的笔记（未保存）。
 *
 * @param entities - 该实例的实体克隆
 * @param title - 标题
 * @returns 笔记
 */
export const makeNote = (entities: EntityType[], title: string): BackupNote => {
  const Note = entities[1] as typeof BackupNote;
  const note = new Note();
  note.title = title;
  note.counter = 0n;
  note.payload = null;
  note.publishedAt = new Date('2026-09-27T00:00:00.000Z');
  note.meta = {};
  note.remark = null;
  note.authorId = null;
  return note;
};

/**
 * 读回全部笔记，按标题排序并换成与 {@link SEEDED_NOTES} 同形的对象。
 *
 * @param adapter - 已连接的 adapter
 * @param entities - 该实例的实体克隆
 * @returns 读回的笔记
 */
export const readNotes = async (adapter: RxDBAdapterSqliteBase, entities: EntityType[]): Promise<SeededNote[]> => {
  const [Author, Note] = entities as [typeof BackupAuthor, typeof BackupNote];
  const authors = await adapter.getRepository(Author).find({ where: { combinator: 'and', rules: [] } });
  const authorNames = new Map<string, string>(authors.map(author => [author.id, author.name]));
  const notes = await adapter.getRepository(Note).find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'title', sort: 'asc' }]
  });
  return notes.map(note => ({
    title: note.title,
    counter: note.counter,
    payload: note.payload,
    publishedAt: note.publishedAt,
    meta: note.meta,
    remark: note.remark,
    authorName: note.authorId ? (authorNames.get(note.authorId) ?? null) : null
  }));
};

/**
 * 取出失败原因里的备份错误码。
 *
 * @param promise - 期望失败的操作
 * @returns 错误码；成功或抛出的不是备份错误时原样返回结果 / 异常，让断言显示真实情况
 */
export const backupErrorCode = async (promise: Promise<unknown>): Promise<unknown> => {
  const outcome = await promise.then(
    value => ({ value }),
    (error: unknown) => ({ error })
  );
  if (!('error' in outcome)) return outcome;
  return isRxDBBackupError(outcome.error) ? outcome.error.code : outcome.error;
};

// ─── 读库 ────────────────────────────────────────────────────────────────────

/**
 * 取出单条查询的行。
 *
 * @param result - 客户端结果
 * @returns 行（数组形式）
 */
export const rowsOf = (result: SqliteResult): unknown[][] => {
  const [first] = result.results;
  if (!first) throw new Error(`Query returned no result set: ${result.sql}`);
  return first.rows;
};

/** 一条变更历史。 */
export interface ChangeRow {
  readonly id: number;
  readonly type: string;
  readonly entity: string;
  readonly entityId: string;
  readonly patch: unknown;
}

/**
 * 读出全部变更历史。
 *
 * @param adapter - 已连接的 adapter
 * @returns 按 id 排序的历史
 */
export const readChanges = async (adapter: RxDBAdapterSqliteBase): Promise<ChangeRow[]> =>
  rowsOf(await adapter.query('SELECT id, type, entity, entityId, patch FROM "rxdb$rxdb_change" ORDER BY id')).map(
    ([id, type, entity, entityId, patch]) => ({
      id: Number(id),
      type: String(type),
      entity: String(entity),
      entityId: String(entityId),
      patch
    })
  );

/** 用户对象（索引、触发器、视图）：恢复必须原样带回这些数据库对象。 */
export const readObjects = async (adapter: RxDBAdapterSqliteBase): Promise<string[]> =>
  rowsOf(
    await adapter.query(
      `SELECT type || ':' || name || ':' || coalesce(sql, '') FROM sqlite_schema
         WHERE type IN ('index', 'trigger', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY 1`
    )
  ).map(([text]) => String(text));

// ─── 目标存储 ────────────────────────────────────────────────────────────────

/** 恢复用的「进行中」标记表名；与产品代码的常量同值，这里写字面量，改名时套件会先红。 */
const RESTORE_MARKER_TABLE = 'rxdb$restore_in_progress';

/** 持久化目标里留下了什么。 */
export interface PersistentTargetState {
  /** 用户对象（不含 `sqlite_` 内部对象），按类型与名字排序。 */
  readonly objects: readonly string[];
  /** 是否留有「恢复进行中」标记。 */
  readonly marker: boolean;
}

/**
 * 绕过连接流程拿一条到持久化目标的裸连接，交给 `use` 用完即关。
 *
 * @remarks
 * `createClient` 是 adapter 的受保护成员：用例要在**不**经过连接门（存储锁、标记检查、建表）的前提下
 * 观察或篡改存储，这正是连接门本身要被验证的场景，所以这里用下标访问绕开可见性。
 *
 * @param harness - 后端
 * @param dbName - 库名
 * @param use - 使用连接
 * @returns `use` 的结果
 */
export const withRawClient = async <T>(
  harness: SqliteBackupHarness,
  dbName: string,
  use: (client: SqliteClientLike) => Promise<T>
): Promise<T> => {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'backup-probe' },
    entities: [],
    sync: { local: { adapter: harness.adapterName }, type: SyncType.None }
  });
  const adapter = harness.createAdapter(rxdb, 'persistent');
  try {
    const client = await adapter['createClient']();
    try {
      return await use(client);
    } finally {
      await client.disconnect();
      releaseComlinkProxy(client);
    }
  } finally {
    await harness.release?.(rxdb);
  }
};

/**
 * 观察持久化目标的残留。
 *
 * @param harness - 后端
 * @param dbName - 库名
 * @returns 残留状态
 */
export const persistentTargetState = (harness: SqliteBackupHarness, dbName: string): Promise<PersistentTargetState> =>
  withRawClient(harness, dbName, async client => {
    // 引擎在每条新连接上自动建出的对象属于空库本来的样子，不算残留
    const engine = new Set(harness.engineObjects?.names);
    const objects = rowsOf(
      await client.execute(
        `SELECT type || ':' || name FROM sqlite_schema WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY 1`
      )
    )
      .map(([text]) => String(text))
      .filter(object => !engine.has(object));
    return { objects, marker: objects.includes(`table:${RESTORE_MARKER_TABLE}`) };
  });

/** 从未恢复过的持久化目标。 */
export const CLEAN_TARGET: PersistentTargetState = { objects: [], marker: false };

/**
 * 在持久化目标里留一个「恢复进行中」标记，模拟上一次恢复没做完。
 *
 * @param harness - 后端
 * @param dbName - 库名
 */
export const writeRestoreMarker = (harness: SqliteBackupHarness, dbName: string): Promise<void> =>
  withRawClient(harness, dbName, async client => {
    await client.execute(`CREATE TABLE "${RESTORE_MARKER_TABLE}" (started_at TEXT NOT NULL)`);
  });

/**
 * 持久化目标的存储锁名。
 *
 * @param harness - 后端
 * @param dbName - 库名
 * @returns 连接与恢复两侧共用的 Web Lock 名
 */
export const storageLockNameOf = (harness: SqliteBackupHarness, dbName: string): string =>
  sqliteStorageLockName(`${harness.adapterName}:${harness.persistentLabel}:${dbName}`);

// ─── 故障注入 ────────────────────────────────────────────────────────────────

/**
 * 在一条语句下发之前改变它的命运：返回异常就把它当作引擎报错抛出，返回字符串就改为执行这条 SQL，
 * 返回 `undefined` 照常执行。
 */
export type SqlOverride = (sql: string) => Error | string | undefined;

/**
 * 让 adapter 此后创建的每个客户端都先过一遍 `override`。
 *
 * @remarks
 * 包一层 `Proxy` 而不是改客户端：Worker 后端的客户端是 Comlink 远端代理，给它赋值会变成一次跨线程写属性。
 * 方法以原对象为 `this` 调用，主线程客户端的私有字段照常可用。
 * 释放包装层时转交给 {@link releaseComlinkProxy} 释放被包的代理：Worker 的子端口按代理身份登记，
 * 只释放包装层等于这条连接永远不还，同一个 Worker 上的下一次连接会被拒。
 *
 * @param adapter - 尚未连接的 adapter
 * @param override - 故障或改写判定
 */
export const interceptSql = (adapter: RxDBAdapterSqliteBase, override: SqlOverride): void => {
  const createClient = adapter['createClient'].bind(adapter);
  adapter['createClient'] = async () => {
    const client = await createClient();
    return new Proxy(client, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        if (property === releaseProxy) return () => releaseComlinkProxy(target);
        if (property !== 'execute') return (...args: unknown[]) => Reflect.apply(value, target, args);
        return (sql: string, bindings?: unknown[]) => {
          const outcome = override(sql);
          if (outcome instanceof Error) return Promise.reject(outcome);
          return Reflect.apply(value, target, [outcome ?? sql, bindings]);
        };
      }
    });
  };
};

// ─── 强杀 ────────────────────────────────────────────────────────────────────

/** module Worker 全局里本工具用到的那一小部分；不引 webworker lib，免得和 DOM lib 打架。 */
interface InterruptWorkerScope {
  postMessage(message: RestoreInterruptReply): void;
  onmessage: ((event: MessageEvent<RestoreInterruptRequest>) => void) | null;
}

/**
 * 在当前 module Worker 里接收恢复任务：把归档恢复到持久化目标，走到指定位置后停住，等主线程 terminate。
 *
 * @remarks
 * terminate 等同进程被强杀：不跑 finally、不释放任何东西，Web Lock 与存储句柄由浏览器随 Worker 一起回收。
 * 停在某个位置靠的是一个永不 resolve 的 Promise，而不是抛错——抛错会走正常的失败清理。
 *
 * @param harness - Worker 里可用的后端（`createAdapter(…, 'persistent')` 要能在 Worker 里直接打开存储）
 */
export const serveInterruptedRestore = (harness: SqliteBackupHarness): void => {
  const scope = globalThis as unknown as InterruptWorkerScope;
  const holdAt = (point: RestoreInterruptPoint): Promise<never> => {
    scope.postMessage({ reached: point } satisfies RestoreInterruptReply);
    return new Promise<never>(() => undefined);
  };
  scope.onmessage = async (event: MessageEvent<RestoreInterruptRequest>) => {
    const { archive, dbName, stopAt } = event.data;
    const target = createBackupRxDB(harness, dbName, PLAIN_ENTITIES, 'persistent');
    const half = archive.byteLength / 2;
    const { stream } = chunkedSource(archive, 1024, async pulled => {
      if (stopAt === 'streaming' && pulled > half) await holdAt(stopAt);
    });
    try {
      await restoreInto(target, stream, {
        onStage: async stage => {
          if (stage === stopAt) await holdAt(stage);
        }
      });
      await holdAt('returned');
    } catch (error) {
      scope.postMessage({ failed: String(error) } satisfies RestoreInterruptReply);
    }
  };
};
