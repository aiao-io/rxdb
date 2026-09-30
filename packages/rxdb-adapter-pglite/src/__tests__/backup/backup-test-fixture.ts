/**
 * 备份 / 恢复套件共用的实体与流工具。
 *
 * @remarks
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
import { resolvePGliteInitOptions } from '../../PGliteClient.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { resolvePGliteBackupStorage } from '../../backup/pglite-backup-compat.js';
import { pgliteIdbDatabaseName } from '../../backup/pglite-restore-fs.js';
import { hasRestoreMarker, isIdbStorageEmpty } from '../../backup/pglite-restore-lock.js';
import type { PGliteRestoredDatabase } from '../../backup/pglite-restored-database.js';
import type { PGliteClientOptions } from '../../pglite.interface.js';
import { cloneEntityClasses } from '../../testing.js';

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

/**
 * 每条用例一个库名，避免 IndexedDB 在用例之间串库。
 *
 * @param prefix - 可读前缀
 * @returns 库名
 */
export const uniqueDbName = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 已注册 adapter、尚未连接的实例，连同它自己那份实体克隆。 */
export interface BackupRxDB {
  readonly rxdb: RxDB;
  /** 恢复目标要用的同一份 adapter 选项。 */
  readonly options: PGliteClientOptions;
  readonly entities: EntityType[];
  /**
   * 连接并返回 adapter。
   *
   * @param restoredDatabase - 内存目标恢复出的句柄，由 adapter 领取
   */
  connect(restoredDatabase?: PGliteRestoredDatabase): Promise<RxDBAdapterPGlite>;
}

/**
 * 造一个尚未连接的实例。
 *
 * @param dbName - 库名
 * @param entities - 实体原型（会被克隆）
 * @param options - adapter 选项
 * @returns 实例、选项、克隆后的实体与连接入口
 */
export const createBackupRxDB = (dbName: string, entities: EntityType[], options: PGliteClientOptions): BackupRxDB => {
  const cloned = cloneEntityClasses(entities);
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'backup-user' },
    entities: cloned,
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  let restoredDatabase: PGliteRestoredDatabase | undefined;
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { ...options, restoredDatabase }));
  return {
    rxdb,
    options,
    entities: cloned,
    async connect(database) {
      restoredDatabase = database;
      const adapter = (await rxdb.getAdapter('pglite')) as RxDBAdapterPGlite;
      await rxdb.connect('pglite');
      return adapter;
    }
  };
};

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
export const readNotes = async (adapter: RxDBAdapterPGlite, entities: EntityType[]): Promise<SeededNote[]> => {
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

/** IndexedDB 目标在存储里留下了什么。 */
export interface IdbTargetState {
  /** 数据目录是否为空（库不存在也算空）。 */
  readonly empty: boolean;
  /** 是否留有「恢复进行中」标记。 */
  readonly marker: boolean;
}

/**
 * IndexedDB 目标的存储键。
 *
 * @param target - IndexedDB 目标
 * @returns `idb://` 之后的名字与规范化 `dataDir`
 */
export const idbStorageOf = (target: BackupRxDB): { name: string; storageKey: string } => {
  const dataDir = resolvePGliteInitOptions(target.rxdb.config.dbName, target.options).dataDir;
  const storage = resolvePGliteBackupStorage(dataDir, 'test');
  if (storage.kind !== 'idb') throw new Error(`Not an IndexedDB target: ${dataDir}`);
  return storage;
};

/**
 * 目标数据目录对应的 IndexedDB 库名。
 *
 * @param target - IndexedDB 目标
 * @returns 库名
 */
export const idbDatabaseNameOf = (target: BackupRxDB): string => pgliteIdbDatabaseName(idbStorageOf(target).name);

/**
 * 探测 IndexedDB 目标的残留。
 *
 * @param target - IndexedDB 目标
 * @returns 残留状态
 */
export const idbTargetState = async (target: BackupRxDB): Promise<IdbTargetState> => ({
  empty: await isIdbStorageEmpty(idbDatabaseNameOf(target)),
  marker: await hasRestoreMarker(idbStorageOf(target).storageKey)
});
