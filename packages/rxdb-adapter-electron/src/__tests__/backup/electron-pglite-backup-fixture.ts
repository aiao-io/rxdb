/**
 * Electron PGlite 备份 / 恢复套件共用的 host、实体与流工具（US-217 阶段 C）。
 *
 * @remarks
 * host 是生产同款、跑在磁盘上的真实 PGlite，与 renderer 之间两个方向都结构化克隆，等同于跨过
 * Electron IPC。实体、种子数据与流工具逐字对齐浏览器侧的 `backup-test-fixture.ts`：两端用同一组
 * 数据验同一份契约，差异只能来自 adapter 本身。数据目录从一次 initdb 得到的模板复制，省掉每个
 * 用例一次 initdb。
 */
import {
  Entity,
  EntityBase,
  isRxDBBackupError,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBBackupArchiveWriter,
  SyncType,
  type EntityType,
  type RxDBBackupManifest
} from '@aiao/rxdb';
import { cloneEntityClasses } from '@aiao/rxdb-adapter-pglite/testing';
import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { PGlite } from '@electric-sql/pglite';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { createElectronPgliteHost, type ElectronPgliteHost } from '../../pglite-host.js';
import { isEmptyOrMissing, walkPgliteDataDirectory } from '../../pglite-host/pglite-host-data-dir.js';
import { acquirePgliteDirectoryLock } from '../../pglite-host/pglite-host-lock.js';
import {
  ADAPTER_NAME,
  DEFAULT_DATA_DIRECTORY_SUFFIX,
  type ElectronPGliteOptions
} from '../../pglite/pglite-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../../pglite/RxDBAdapterElectronPGlite.js';
import type { PgliteHostProcessBody } from './electron-pglite-host-process.js';
import { forkHostProcess } from './forked-host-process.js';

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
 * 每条用例一个库名；数据目录名默认由库名派生，同一个 host 根目录下也不会串目录。
 *
 * @param prefix - 可读前缀
 * @returns 库名
 */
export const uniqueDbName = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let templateRoot: string | undefined;

const templateDirectory = (): string => {
  if (templateRoot === undefined) throw new Error('call preparePgliteTemplate() in beforeAll first');
  return join(templateRoot, 'template');
};

/**
 * initdb 一次，得到后续用例复制的模板数据目录。放进 `beforeAll`，超时给足（冷启动要几十秒）。
 */
export const preparePgliteTemplate = async (): Promise<void> => {
  templateRoot = mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-backup-template-'));
  const pg = new PGlite(templateDirectory());
  await pg.waitReady;
  await pg.close();
};

/**
 * PGlite 用例的单条超时，挂在各套件的 `describe` 上。
 *
 * @remarks
 * 一条恢复用例要起好几个 PGlite 实例（探测、私有实例、重新打开），与其他套件并行时单个实例启动就要数秒，
 * 默认的 10 秒不够。
 */
export const PGLITE_TEST_TIMEOUT = 60_000;

/** 删掉模板；放进 `afterAll`。 */
export const removePgliteTemplate = (): void => {
  if (templateRoot !== undefined) rmSync(templateRoot, { recursive: true, force: true });
  templateRoot = undefined;
};

/** {@link startBackupHost} 的选项。 */
export interface BackupHostOptions {
  /** host 声明的扩展名；默认不带扩展。 */
  readonly extensions?: readonly string[];
  /** 起一个不带备份能力的 host，模拟没有接入 US-217 的旧主进程。 */
  readonly withoutBackup?: boolean;
  /** 沿用已有的根目录，模拟应用重启后回到同一个数据位置；默认新建临时根目录。 */
  readonly root?: string;
}

/** 数据目录在磁盘上留下了什么。 */
export interface DataDirectoryState {
  /** 数据目录是否为空（不存在也算空）。 */
  readonly empty: boolean;
  /** 是否留有「恢复进行中」标记。 */
  readonly marker: boolean;
}

/** 一个跑在临时根目录上的 host。 */
export interface BackupHost {
  readonly root: string;
  readonly host: ElectronPgliteHost;
  /** host 推送通知失败的记录；正常用例结束时应为空。 */
  readonly deliveryErrors: unknown[];
  /**
   * 某个窗口的传输层：请求与应答都结构化克隆，与 Electron IPC 一样不共享任何引用。
   *
   * @param ownerId - 窗口标识
   */
  transportFor(ownerId: number): DesktopHostTransport;
  /**
   * 逻辑名对应的物理目录。
   *
   * @param dataDirectoryName - 数据目录名
   */
  directoryOf(dataDirectoryName: string): string;
  /**
   * 探测目录的残留；只在没有任何连接或恢复持有目录锁时调用。
   *
   * @param dataDirectoryName - 数据目录名
   */
  targetState(dataDirectoryName: string): Promise<DataDirectoryState>;
  /** 关掉 host 与全部运行时但保留根目录，之后可以在同一根目录上再起 host（模拟应用重启）；可重复调用。 */
  close(): Promise<void>;
  /** 关掉 host 与全部运行时并删除根目录；可重复调用。 */
  stop(): Promise<void>;
}

/**
 * 在临时根目录上起一个带备份能力的 host。
 *
 * @param options - 扩展声明与是否带备份能力
 * @returns host 与观测手段
 */
export const startBackupHost = (options: BackupHostOptions = {}): BackupHost => {
  const root = options.root ?? mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-backup-'));
  const directoryOf = (name: string): string => join(root, name);
  const runtimes: PGlite[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const deliveryErrors: unknown[] = [];
  const host = createElectronPgliteHost({
    createRuntime: async name => {
      const directory = directoryOf(name);
      // 只给还不存在的目录铺模板：恢复在 open 时起的私有实例必须打开归档写出来的那棵树。
      if (!existsSync(directory)) cpSync(templateDirectory(), directory, { recursive: true });
      const runtime = new PGlite(directory);
      runtimes.push(runtime);
      await runtime.waitReady;
      return runtime;
    },
    postNotify: message => {
      for (const listener of listeners) listener(structuredClone(message));
    },
    onDeliveryError: error => {
      deliveryErrors.push(error);
    },
    ...(options.withoutBackup ?
      {}
    : {
        backup: {
          resolveDataDirectory: directoryOf,
          createProbeRuntime: async () => new PGlite(),
          extensions: options.extensions ?? []
        }
      })
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      await host.closeAll();
      for (const runtime of runtimes) await runtime.close().catch(() => undefined);
    })();
    return closing;
  };
  return {
    root,
    host,
    deliveryErrors,
    transportFor: ownerId => ({
      request: async payload => structuredClone(await host.handle(structuredClone(payload), ownerId)),
      subscribe: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    }),
    directoryOf,
    targetState: async name => {
      const lock = acquirePgliteDirectoryLock(directoryOf(name));
      try {
        return { empty: await isEmptyOrMissing(directoryOf(name)), marker: lock.hasMarker() };
      } finally {
        lock.release();
      }
    },
    close,
    stop: async () => {
      await close();
      rmSync(root, { recursive: true, force: true });
    }
  };
};

/** 跑在子进程里的一个带备份能力的 host，见 {@link forkBackupHost}。 */
export interface ForkedBackupHost {
  /**
   * 某个窗口的传输层：请求与应答经 Node IPC 结构化克隆。
   *
   * @param ownerId - 窗口标识
   */
  transportFor(ownerId: number): DesktopHostTransport;
  /** 子进程写到 stdout / stderr 的全部内容；正常情况下应为空。 */
  output(): string;
  /** host 推送通知失败的记录；正常用例结束时应为空。 */
  readonly deliveryErrors: readonly unknown[];
  /** 以 SIGKILL 强杀 host 进程并等它退出；已经退出时直接返回。 */
  kill(): Promise<void>;
  /** host 进程自启动以来的峰值常驻内存（字节），见 `host-process-wire.ts` 的 `peakRssBytes`。 */
  peakRss(): Promise<number>;
}

/**
 * 在 `root` 上把带备份能力的 host 起在一个子进程里，供强杀用例（AC#11）使用。
 *
 * @remarks
 * 与 {@link startBackupHost} 的区别只在 host 与测试不在同一个进程：它能被 SIGKILL，被杀后目录锁由操作系统回收，
 * 数据目录与恢复标记原样留在盘上。杀掉之后在同一根目录上用 {@link startBackupHost} 起新 host，等同于应用重启。
 * 用完由套件调 `removeHostProcessBundles()` 删掉入口的打包产物。
 *
 * @param root - 数据根目录
 * @param probeServerVersion - 给了它，`pg.engine` 直接回答这个版本而不起探针实例；只给内存用例用，
 *   见 `electron-pglite-host-process.ts`
 * @returns 子进程 host 的传输层与强杀入口
 */
export const forkBackupHost = (root: string, probeServerVersion?: string): ForkedBackupHost => {
  const forked = forkHostProcess<PgliteHostProcessBody>(
    join(import.meta.dirname, 'electron-pglite-host-process.ts'),
    [root, templateDirectory(), ...(probeServerVersion === undefined ? [] : [probeServerVersion])],
    ['@electric-sql/pglite']
  );
  return {
    transportFor: ownerId => ({
      request: payload => forked.request({ payload, ownerId }),
      subscribe: listener => forked.subscribe(listener)
    }),
    output: () => forked.output(),
    deliveryErrors: forked.deliveryErrors,
    kill: () => forked.kill(),
    peakRss: async () => (await forked.request({ probe: 'peakRss' })) as number
  };
};

/** 已注册 adapter、尚未连接的实例，连同它自己那份实体克隆；同时就是一个恢复目标。 */
export interface ElectronBackupRxDB {
  readonly rxdb: RxDB;
  /** 恢复目标要用的同一份 adapter 选项。 */
  readonly options: ElectronPGliteOptions;
  readonly entities: EntityType[];
  /** 连接并返回 adapter。 */
  connect(): Promise<RxDBAdapterElectronPGlite>;
}

/**
 * 造一个尚未连接的实例。
 *
 * @param dbName - 库名
 * @param entities - 实体原型（会被克隆）
 * @param options - adapter 选项，至少带上 {@link BackupHost.transportFor} 给的传输层
 * @returns 实例、选项、克隆后的实体与连接入口
 */
export const createElectronBackupRxDB = (
  dbName: string,
  entities: EntityType[],
  options: ElectronPGliteOptions
): ElectronBackupRxDB => {
  const cloned = cloneEntityClasses(entities);
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'backup-user' },
    entities: cloned,
    sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
  });
  rxdb.adapter(ADAPTER_NAME, db => new RxDBAdapterElectronPGlite(db, options));
  return {
    rxdb,
    options,
    entities: cloned,
    async connect() {
      const adapter = await rxdb.getAdapter(ADAPTER_NAME);
      await rxdb.connect(ADAPTER_NAME);
      return adapter;
    }
  };
};

/**
 * 实例对应的数据目录名，与 adapter 默认规则一致。
 *
 * @remarks
 * 必须按 `rxdb.config.dbName` 推：RxDB 会给传入的名字追加实例后缀，拿原名拼出来的是另一个目录。
 *
 * @param rxdb - 实例
 * @returns 数据目录名
 */
export const dataDirectoryNameOf = (rxdb: RxDB): string => `${rxdb.config.dbName}${DEFAULT_DATA_DIRECTORY_SUFFIX}`;

/** 一份播种过的归档与它的 manifest。 */
export interface SeededArchive {
  readonly bytes: Uint8Array;
  readonly manifest: RxDBBackupManifest;
}

/**
 * 在一台独立的 host 上播种并备份，随后连 host 带根目录一起删掉：恢复只能依赖归档字节。
 *
 * @param options - 源 host 的选项
 * @returns 归档字节与 manifest
 */
export const backupSeededArchive = async (options: BackupHostOptions = {}): Promise<SeededArchive> => {
  const host = startBackupHost(options);
  const source = createElectronBackupRxDB(uniqueDbName('electron-pg-src'), PLAIN_ENTITIES, {
    transport: host.transportFor(1)
  });
  try {
    const adapter = await source.connect();
    await seedNotes(source.entities);
    const out = collectingSink();
    const result = await adapter.backup(out.sink);
    return { bytes: out.bytes(), manifest: result.manifest };
  } finally {
    await source.rxdb.disconnectAll();
    await host.stop();
  }
};

/**
 * 让传输层替 host 回答部分请求，其余照常转发。
 *
 * @param base - 被包装的传输层
 * @param answer - 返回应答表示代答（可以是 Promise）；返回 `undefined` 表示转发
 * @returns 包装后的传输层
 */
export const interceptTransport = (
  base: DesktopHostTransport,
  answer: (payload: { readonly kind: string }) => unknown
): DesktopHostTransport => ({
  request: async payload => (await answer(payload)) ?? base.request(payload),
  subscribe: listener => base.subscribe(listener)
});

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

/**
 * 用一份真实的 manifest 包装 initdb 模板目录，得到「声明与载荷不一致」的归档。
 *
 * @remarks
 * 格式、帧与结束标记里的摘要都由写入器按实际内容生成，读取器挑不出毛病；manifest 也来自真实备份，
 * 兼容性判定照样通过。但模板里只有 PostgreSQL 自己的库，没有 RxDB 的系统表：只有恢复后在私有实例上
 * 核对库的实际状态，才能发现它不是 manifest 声明的那个库。
 *
 * @param manifest - 从真实备份里取来的 manifest
 * @returns 归档字节
 */
export const encodeTemplateArchive = async (manifest: RxDBBackupManifest): Promise<Uint8Array> => {
  const out = collectingSink();
  const writer = out.sink.getWriter();
  const archive = new RxDBBackupArchiveWriter(writer);
  await archive.writeManifest(manifest);
  for await (const item of walkPgliteDataDirectory(templateDirectory())) {
    if (item.type === 'entry') await archive.beginEntry(item.header);
    else await archive.writeData(item.bytes);
  }
  await archive.finish();
  await writer.close();
  return out.bytes();
};

/**
 * 字节里是否出现某段 UTF-8 文本；加密用例据此确认明文与口令没有进归档。
 *
 * @param haystack - 被查找的字节
 * @param text - 要找的文本
 * @returns 是否出现
 */
export const containsBytes = (haystack: Uint8Array, text: string): boolean =>
  Buffer.from(haystack.buffer, haystack.byteOffset, haystack.byteLength).includes(Buffer.from(text, 'utf8'));

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
 * @param entities - {@link createElectronBackupRxDB} 返回的克隆（顺序同 {@link PLAIN_ENTITIES}）
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
export const readNotes = async (adapter: RxDBAdapterElectronPGlite, entities: EntityType[]): Promise<SeededNote[]> => {
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

/** `rxdb_change` 里用来比对历史的列。 */
export interface ChangeRow {
  id: number;
  type: string;
  entity: string;
  entityId: string;
  patch: unknown;
}

/**
 * 读回全部变更历史。
 *
 * @param adapter - 已连接的 adapter
 * @returns 按 id 排序的历史
 */
export const readChanges = async (adapter: RxDBAdapterElectronPGlite): Promise<ChangeRow[]> =>
  (await adapter.query<ChangeRow>('SELECT id, type, entity, "entityId", patch FROM "rxdb"."rxdb_change" ORDER BY id'))
    .rows;

/**
 * 用户可见 schema 里的索引、触发器与序列：恢复必须原样带回这些数据库对象。
 *
 * @param adapter - 已连接的 adapter
 * @returns 排序后的对象名
 */
export const readObjects = async (adapter: RxDBAdapterElectronPGlite): Promise<string[]> =>
  (
    await adapter.query<{ name: string }>(
      `SELECT 'index:' || schemaname || '.' || indexname AS name FROM pg_indexes
         WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
       UNION ALL
       SELECT 'trigger:' || c.relname || '.' || t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
         WHERE NOT t.tgisinternal
       UNION ALL
       SELECT 'sequence:' || sequence_schema || '.' || sequence_name FROM information_schema.sequences
       ORDER BY name`
    )
  ).rows.map(row => row.name);

/**
 * 恢复出来的库可以继续写：唯一约束、外键动作都还在，新变更接着原有历史记账。
 *
 * @param target - 已连接的恢复目标
 * @param adapter - 目标的 adapter
 * @param before - 恢复时带过来的历史
 */
export const expectWritable = async (
  target: ElectronBackupRxDB,
  adapter: RxDBAdapterElectronPGlite,
  before: ChangeRow[]
): Promise<void> => {
  const [Author] = target.entities as [typeof BackupAuthor];
  const duplicate = new Author();
  duplicate.name = 'alice';
  await expect(duplicate.save()).rejects.toThrow();

  await makeNote(target.entities, 'd-after-restore').save();
  const after = await readChanges(adapter);
  expect(after.slice(0, before.length)).toEqual(before);
  const appended = after.slice(before.length);
  expect(appended.map(row => [row.type, row.entity])).toEqual([['INSERT', 'BackupNote']]);
  expect(appended[0].id).toBeGreaterThan(before[before.length - 1].id);

  // ON DELETE SET NULL 仍由数据库执行。
  const [alice] = await adapter.getRepository(Author).find({
    where: { combinator: 'and', rules: [{ field: 'name', operator: '=', value: 'alice' }] }
  });
  await alice.remove();
  const notes = await readNotes(adapter, target.entities);
  expect(notes.every(note => note.authorName === null)).toBe(true);
  expect(notes.map(note => note.title)).toContain('d-after-restore');
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

/**
 * 一个可以从外部放行的闸门。
 *
 * @returns 闸门与放行函数
 */
export const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
};
