/**
 * Electron PGlite 备份 / 恢复经 renderer ↔ host 通道传输（US-217 阶段 C：AC#10、#19、#21）。
 *
 * @remarks
 * 两端都是真的：renderer 侧是 adapter 的 `backup()` 与 `restoreElectronPGliteDatabase()`，host 侧是
 * `createElectronPgliteHost`，中间的传输层两个方向都结构化克隆。用例在传输层与调用方的流上注入故障：
 *
 * - **背压**：任一时刻至多一个数据请求在途，单条消息携带的 buffer 不超过公共块大小；消费方或 host
 *   慢下来时，另一侧不多读一块。
 * - **断开**：输出流写失败 / 关闭失败、取消、窗口关闭、host 进程被杀、通道丢一条消息或彻底断开。
 *   失败都可判别；备份不报成功且 host 上不留快照，源库照常读写；恢复遵守失败原子性。
 * - **协议不兼容**：恢复在读归档、碰目标之前拒绝；备份在连接时拒绝，host 上什么都不建。
 *
 * 恢复在各阶段被打断的判定见 `electron-pglite-restore-concurrency.spec.ts` 与
 * `electron-pglite-restore-kill.spec.ts`，host 自身的快照生命周期见 `electron-pglite-host-backup.spec.ts`。
 */
import {
  isRxDBBackupError,
  RXDB_BACKUP_CHUNK_SIZE,
  RxDBBackupArchiveReader,
  type RxDB,
  type RxDBBackupTrailer
} from '@aiao/rxdb';
import {
  DESKTOP_PGLITE_PROTOCOL_VERSION,
  RxDBAdapterDesktopError,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupIncompleteElectronPGliteRestore,
  restoreElectronPGliteDatabase
} from '../../pglite/restore-electron-pglite-database.js';
import type { RxDBAdapterElectronPGlite } from '../../pglite/RxDBAdapterElectronPGlite.js';
import {
  backupErrorCode,
  backupSeededArchive,
  chunkedSource,
  collectingSink,
  createElectronBackupRxDB,
  dataDirectoryNameOf,
  deferred,
  forkBackupHost,
  interceptTransport,
  makeNote,
  PGLITE_TEST_TIMEOUT,
  PLAIN_ENTITIES,
  preparePgliteTemplate,
  readNotes,
  removePgliteTemplate,
  SEEDED_NOTES,
  seedNotes,
  startBackupHost,
  uniqueDbName,
  type BackupHost,
  type BackupHostOptions,
  type ElectronBackupRxDB,
  type ForkedBackupHost,
  type SeededArchive
} from './electron-pglite-backup-fixture.js';
import { removeHostProcessBundles } from './forked-host-process.js';

const OWNER = 5;
const OTHER_OWNER = 6;

beforeAll(preparePgliteTemplate, 60_000);
afterAll(() => {
  removeHostProcessBundles();
  removePgliteTemplate();
});

const roots: string[] = [];
const forked: ForkedBackupHost[] = [];
const hosts: BackupHost[] = [];
const opened: RxDB[] = [];
/** host 已经替它们收掉会话的实例：断开时 `pg.close` 注定失败，只求不留运行时。 */
const orphaned: RxDB[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map(rxdb => rxdb.disconnectAll()));
  await Promise.all(orphaned.splice(0).map(rxdb => rxdb.disconnectAll().catch(() => undefined)));
  const killed = forked.splice(0);
  await Promise.all(killed.map(host => host.kill()));
  expect(killed.map(host => host.output()).join('')).toBe('');
  expect(killed.flatMap(host => host.deliveryErrors)).toEqual([]);
  const started = hosts.splice(0);
  for (const host of started) await host.close();
  for (const host of started) await host.stop();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const start = (options?: BackupHostOptions): BackupHost => {
  const host = startBackupHost(options);
  hosts.push(host);
  return host;
};

/** 应用重启：在被杀 host 的根目录上起一个进程内 host。 */
const restartOn = (root: string): BackupHost => start({ root });

let seeded: Promise<SeededArchive> | undefined;

/** 整个文件共用的播种归档；用例只读它，不改它。 */
const seededArchive = (): Promise<SeededArchive> => {
  seeded ??= backupSeededArchive();
  return seeded;
};

/** 一个尚未连接的实例；同一 `dbName` 的实例指向同一个数据目录。 */
const instanceOn = (dbName: string, transport: DesktopHostTransport): ElectronBackupRxDB => {
  const instance = createElectronBackupRxDB(dbName, PLAIN_ENTITIES, { transport });
  opened.push(instance.rxdb);
  return instance;
};

/** host 已收掉这个实例的会话。 */
const orphan = (rxdb: RxDB): void => {
  opened.splice(opened.indexOf(rxdb), 1);
  orphaned.push(rxdb);
};

/** 连上一个源库并播种。 */
const connectSource = async (transport: DesktopHostTransport, dbName = uniqueDbName('electron-pg-src')) => {
  const source = instanceOn(dbName, transport);
  const adapter = await source.connect();
  await seedNotes(source.entities);
  return { source, adapter, dbName };
};

/** 用一个新实例读回全部笔记，读完即断开。 */
const readAll = async (host: BackupHost, dbName: string): Promise<unknown> => {
  const reader = instanceOn(dbName, host.transportFor(OTHER_OWNER));
  const adapter = await reader.connect();
  const notes = await readNotes(adapter, reader.entities);
  await reader.rxdb.disconnectAll();
  return notes;
};

/** 恢复失败后目标回到从未恢复过的状态：host 上没有残留的恢复，目录与标记都不在。 */
const expectCleanTarget = async (host: BackupHost, dataDirectoryName: string): Promise<void> => {
  expect(host.host.openRestoreCount).toBe(0);
  expect(await host.targetState(dataDirectoryName)).toEqual({ empty: true, marker: false });
};

/** AC#19：备份失败之后源库照常读写。 */
const expectSourceUsable = async (source: ElectronBackupRxDB, adapter: RxDBAdapterElectronPGlite): Promise<void> => {
  await makeNote(source.entities, 'after-failed-backup').save();
  expect((await readNotes(adapter, source.entities)).map(note => note.title)).toContain('after-failed-backup');
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** 从头读完一份归档，取出结束标记；读取器会逐帧校验摘要。 */
const readTrailer = async (bytes: Uint8Array): Promise<RxDBBackupTrailer> => {
  const archive = new RxDBBackupArchiveReader(chunkedSource(bytes).stream.getReader());
  await archive.readManifest();
  let item = await archive.next();
  while (item.type !== 'end') item = await archive.next();
  return item.trailer;
};

/**
 * 让 host 自称说另一个版本的协议，并记下经过通道的请求种类。
 *
 * @param base - 被包装的传输层
 * @param protocolVersion - host 声称的协议版本
 * @param kinds - 收集请求种类的数组
 */
const skewHandshake = (base: DesktopHostTransport, protocolVersion: number, kinds: string[]): DesktopHostTransport =>
  interceptTransport(base, payload => {
    kinds.push(payload.kind);
    return payload.kind === 'pg.handshake' ? { kind: 'pg.handshake', result: { protocolVersion } } : undefined;
  });

/** 某一类请求在通道上的计量。 */
interface ChannelStats {
  /** 已发出的请求数。 */
  sent: number;
  /** 已发出、尚未收到应答的请求数。 */
  inFlight: number;
  /** 同一时刻最多的在途请求数。 */
  maxInFlight: number;
  /** 单条消息携带的最大底层 buffer：结构化克隆按整块 buffer 复制，这才是过通道的实际大小。 */
  largestBuffer: number;
}

/** 请求（`item.bytes`）或应答（`result.bytes`）携带的底层 buffer 大小。 */
const carriedBuffer = (message: unknown): number => {
  const { item, result } = (message ?? {}) as {
    readonly item?: { readonly bytes?: unknown };
    readonly result?: { readonly bytes?: unknown };
  };
  const bytes = item?.bytes ?? result?.bytes;
  return bytes instanceof Uint8Array ? bytes.buffer.byteLength : 0;
};

/**
 * 计量通道上某一类请求，可在发出前拖住它（模拟慢 host）。
 *
 * @param base - 被包装的传输层
 * @param kind - 被计量的请求种类
 * @param beforeSend - 每条该类请求交给 host 之前回调（会被等待），参数是含本条在内的已发出条数
 * @returns 包装后的传输层与计量
 */
const meterChannel = (
  base: DesktopHostTransport,
  kind: string,
  beforeSend?: (sent: number) => void | Promise<void>
): { readonly transport: DesktopHostTransport; readonly stats: ChannelStats } => {
  const stats: ChannelStats = { sent: 0, inFlight: 0, maxInFlight: 0, largestBuffer: 0 };
  const transport: DesktopHostTransport = {
    request: async payload => {
      if (payload.kind !== kind) return base.request(payload);
      stats.sent += 1;
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      try {
        await beforeSend?.(stats.sent);
        const response = await base.request(payload);
        stats.largestBuffer = Math.max(stats.largestBuffer, carriedBuffer(payload), carriedBuffer(response));
        return response;
      } finally {
        stats.inFlight -= 1;
      }
    },
    subscribe: listener => base.subscribe(listener)
  };
  return { transport, stats };
};

/** 输出流侧注入的失败：描述、它应归入的错误码与造错函数。 */
const SINK_FAILURES: ReadonlyArray<readonly [string, string, () => unknown]> = [
  ['an I/O error', 'io_error', () => new Error('EIO: i/o error, write')],
  ['a QuotaExceededError', 'storage_full', () => new DOMException('The quota has been exceeded', 'QuotaExceededError')],
  // Node 的可写流（`Writable.toWeb(createWriteStream(...))`）磁盘满时抛的是带 `code` 的普通 Error。
  [
    'ENOSPC',
    'storage_full',
    () => Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' })
  ]
];

describe('RxDBAdapterElectronPGlite.backup over the host channel', { timeout: PGLITE_TEST_TIMEOUT }, () => {
  it('pulls one item at a time and stops reading while the host or the consumer is slow', async () => {
    const host = start();
    const hostGate = deferred();
    const hostStalled = deferred();
    const channel = meterChannel(host.transportFor(OWNER), 'pg.backup.next', async sent => {
      if (sent !== 20) return;
      hostStalled.resolve();
      await hostGate.promise;
    });
    const { adapter } = await connectSource(channel.transport);
    const sinkGate = deferred();
    const sinkStalled = deferred();
    const out = collectingSink(async (_, index) => {
      if (index !== 50) return;
      sinkStalled.resolve();
      await sinkGate.promise;
    });

    const backup = adapter.backup(out.sink);

    // host 慢：第 20 条请求迟迟不回，renderer 不会抢先发第 21 条。
    await hostStalled.promise;
    const writtenWhileHostStalled = out.chunkSizes.length;
    await sleep(100);
    expect(channel.stats).toMatchObject({ sent: 20, inFlight: 1 });
    expect(out.chunkSizes).toHaveLength(writtenWhileHostStalled);
    hostGate.resolve();

    // 消费方慢：输出流卡住时通道上没有在途请求，host 也不读下一块，快照一直占着。
    await sinkStalled.promise;
    const sentWhileSinkStalled = channel.stats.sent;
    await sleep(100);
    expect(channel.stats.sent).toBe(sentWhileSinkStalled);
    expect(channel.stats.inFlight).toBe(0);
    expect(host.host.openBackupCount).toBe(1);
    sinkGate.resolve();

    const result = await backup;
    expect(out.closed()).toBe(true);
    expect(channel.stats.maxInFlight).toBe(1);
    expect(channel.stats.largestBuffer).toBeGreaterThan(0);
    expect(channel.stats.largestBuffer).toBeLessThanOrEqual(RXDB_BACKUP_CHUNK_SIZE);
    expect(await readTrailer(out.bytes())).toEqual({
      entries: result.entries,
      bytes: result.bytes,
      sha256: result.sha256
    });
    expect(host.host.openBackupCount).toBe(0);
  });

  for (const [label, code, failure] of SINK_FAILURES) {
    it(`reports ${code} when the output stream fails mid-archive with ${label} and releases the snapshot`, async () => {
      const host = start();
      const { source, adapter } = await connectSource(host.transportFor(OWNER));
      const out = collectingSink((_, index) => {
        if (index === 30) throw failure();
      });

      expect(await backupErrorCode(adapter.backup(out.sink))).toBe(code);

      expect(out.closed()).toBe(false);
      expect(host.host.openBackupCount).toBe(0);
      await expectSourceUsable(source, adapter);
    });

    it(`reports ${code} when closing the output stream fails with ${label} and releases the snapshot`, async () => {
      const host = start();
      const { source, adapter } = await connectSource(host.transportFor(OWNER));
      let writes = 0;
      const sink = new WritableStream<Uint8Array>({
        write() {
          writes += 1;
        },
        close() {
          throw failure();
        }
      });

      // 归档已经完整写出，最后一步落盘失败：同样不能报成功。
      expect(await backupErrorCode(adapter.backup(sink))).toBe(code);

      expect(writes).toBeGreaterThan(0);
      expect(host.host.openBackupCount).toBe(0);
      await expectSourceUsable(source, adapter);
    });
  }

  it('stops with aborted when cancelled mid-archive, aborts the output and releases the snapshot', async () => {
    const host = start();
    const { source, adapter } = await connectSource(host.transportFor(OWNER));
    const controller = new AbortController();
    const out = collectingSink((_, index) => {
      if (index === 30) controller.abort(new Error('user cancelled'));
    });

    expect(await backupErrorCode(adapter.backup(out.sink, { signal: controller.signal }))).toBe('aborted');

    expect(out.aborted()).toBe(true);
    expect(out.closed()).toBe(false);
    expect(host.host.openBackupCount).toBe(0);
    await expectSourceUsable(source, adapter);
  });

  it('stops with aborted when cancelled while the consumer is stuck in a write', async () => {
    const host = start();
    const { source, adapter } = await connectSource(host.transportFor(OWNER));
    const controller = new AbortController();
    const stuck = deferred();
    let writes = 0;
    const sink = new WritableStream<Uint8Array>({
      write(_, sinkController) {
        writes += 1;
        if (writes !== 30) return undefined;
        stuck.resolve();
        // 消费方卡死在这一块上，只认流自己的中止信号。
        return new Promise<void>((_resolve, reject) => {
          sinkController.signal.addEventListener('abort', () => reject(sinkController.signal.reason), { once: true });
        });
      }
    });

    const backup = backupErrorCode(adapter.backup(sink, { signal: controller.signal }));
    await stuck.promise;
    controller.abort(new Error('user cancelled'));

    expect(await backup).toBe('aborted');
    expect(host.host.openBackupCount).toBe(0);
    await expectSourceUsable(source, adapter);
  });

  it('reports io_error when the host fails to read the data directory and releases the snapshot', async () => {
    const host = start();
    let nexts = 0;
    let beforeSecondRead = (): void => undefined;
    const transport = interceptTransport(host.transportFor(OWNER), payload => {
      if (payload.kind === 'pg.backup.next' && ++nexts === 2) beforeSecondRead();
      return undefined;
    });
    const { source, adapter } = await connectSource(transport);
    // 第一项（PG_VERSION）已经交出，host 还没读到的文件在快照途中消失。
    beforeSecondRead = () => rmSync(join(host.directoryOf(adapter.dataDirectoryName), 'postgresql.conf'));
    const out = collectingSink();

    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('io_error');

    expect(out.aborted()).toBe(true);
    expect(out.closed()).toBe(false);
    expect(host.host.openBackupCount).toBe(0);
    await expectSourceUsable(source, adapter);
  });

  it('ends the snapshot when the window closes mid-backup and leaves the database to other windows', async () => {
    const host = start();
    const { source, adapter, dbName } = await connectSource(host.transportFor(OWNER));
    const sinkGate = deferred();
    const sinkStalled = deferred();
    const out = collectingSink(async (_, index) => {
      if (index !== 50) return;
      sinkStalled.resolve();
      await sinkGate.promise;
    });

    const backup = backupErrorCode(adapter.backup(out.sink));
    await sinkStalled.promise;
    await host.host.releaseOwner(OWNER);
    orphan(source.rxdb);

    // 窗口一关，host 就结束它名下的快照并交还数据目录，别的窗口照常读写。
    expect(host.host.openBackupCount).toBe(0);
    const other = instanceOn(dbName, host.transportFor(OTHER_OWNER));
    const otherAdapter = await other.connect();
    expect(await readNotes(otherAdapter, other.entities)).toEqual(SEEDED_NOTES);
    await makeNote(other.entities, 'after-window-closed').save();

    sinkGate.resolve();
    expect(await backup).toBe('invalid_state');
    expect(out.closed()).toBe(false);
  });

  it('reports io_error when the host process is killed mid-backup and the database reopens intact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rxdb-electron-pg-transport-'));
    roots.push(root);
    const killable = forkBackupHost(root);
    forked.push(killable);
    let nexts = 0;
    const transport = interceptTransport(killable.transportFor(OWNER), async payload => {
      if (payload.kind === 'pg.backup.next' && ++nexts === 50) await killable.kill();
      return undefined;
    });
    const { source, adapter, dbName } = await connectSource(transport);
    const out = collectingSink();

    expect(await backupErrorCode(adapter.backup(out.sink))).toBe('io_error');

    expect(out.aborted()).toBe(true);
    expect(out.closed()).toBe(false);
    orphan(source.rxdb);
    // 应用重启：源库没有因为一次半途而废的快照受损。
    const restarted = restartOn(root);
    const reader = instanceOn(dbName, restarted.transportFor(OTHER_OWNER));
    const readerAdapter = await reader.connect();
    expect(await readNotes(readerAdapter, reader.entities)).toEqual(SEEDED_NOTES);
    await makeNote(reader.entities, 'after-host-killed').save();
  });

  it('refuses to connect to a host that speaks another protocol before anything is created', async () => {
    const host = start();
    const kinds: string[] = [];
    const source = instanceOn(
      uniqueDbName('electron-pg-src'),
      skewHandshake(host.transportFor(OWNER), DESKTOP_PGLITE_PROTOCOL_VERSION + 1, kinds)
    );

    const error = await source.connect().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBAdapterDesktopError);
    expect((error as RxDBAdapterDesktopError).code).toBe('protocol_violation');
    // 没有会话就没有可以备份的源；host 上连数据目录都没建。
    expect(kinds).toEqual(['pg.handshake']);
    expect(existsSync(host.directoryOf(dataDirectoryNameOf(source.rxdb)))).toBe(false);
    expect(host.host.openSessionCount).toBe(0);
  });
});

describe('restoreElectronPGliteDatabase over the host channel', { timeout: PGLITE_TEST_TIMEOUT }, () => {
  it('writes one item at a time and stops pulling the archive while the host is slow', async () => {
    const { bytes } = await seededArchive();
    const host = start();
    const hostGate = deferred();
    const hostStalled = deferred();
    const channel = meterChannel(host.transportFor(OWNER), 'pg.restore.write', async sent => {
      if (sent !== 100) return;
      hostStalled.resolve();
      await hostGate.promise;
    });
    const dbName = uniqueDbName('electron-pg-dst');
    const source = chunkedSource(bytes);

    const restore = restoreElectronPGliteDatabase(source.stream, instanceOn(dbName, channel.transport));

    await hostStalled.promise;
    const pulledWhileStalled = source.probe.pulledBytes;
    await sleep(100);
    expect(source.probe.pulledBytes).toBe(pulledWhileStalled);
    expect(pulledWhileStalled).toBeLessThan(bytes.byteLength);
    expect(channel.stats.inFlight).toBe(1);
    hostGate.resolve();

    await restore;
    expect(channel.stats.maxInFlight).toBe(1);
    expect(channel.stats.largestBuffer).toBeGreaterThan(0);
    expect(channel.stats.largestBuffer).toBeLessThanOrEqual(RXDB_BACKUP_CHUNK_SIZE);
    expect(await readAll(host, dbName)).toEqual(SEEDED_NOTES);
  });

  const LOST: ReadonlyArray<readonly [string, boolean]> = [
    ['a write request', false],
    ['the reply to a write', true]
  ];

  for (const [lost, delivered] of LOST) {
    it(`rolls the target back when the channel loses ${lost} and restores on retry`, async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const dbName = uniqueDbName('electron-pg-dst');
      const base = host.transportFor(OWNER);
      let writes = 0;
      const target = instanceOn(dbName, {
        request: async payload => {
          if (payload.kind !== 'pg.restore.write' || ++writes !== 60) return base.request(payload);
          // 应答丢失：host 已经写下这一块，renderer 却收不到结果。
          if (delivered) await base.request(payload);
          throw new Error('the message was lost on the channel');
        },
        subscribe: listener => base.subscribe(listener)
      });
      const source = chunkedSource(bytes);

      expect(await backupErrorCode(restoreElectronPGliteDatabase(source.stream, target))).toBe('io_error');

      expect(source.probe.cancelled).toBe(true);
      await expectCleanTarget(host, dataDirectoryNameOf(target.rxdb));
      await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, instanceOn(dbName, base));
      expect(await readAll(host, dbName)).toEqual(SEEDED_NOTES);
    });
  }

  it('reports cleanup_pending when the channel breaks for good and recovers once the window is gone', async () => {
    const { bytes } = await seededArchive();
    const host = start();
    const dbName = uniqueDbName('electron-pg-dst');
    let writes = 0;
    let broken = false;
    const target = instanceOn(
      dbName,
      interceptTransport(host.transportFor(OWNER), payload => {
        if (payload.kind === 'pg.restore.write' && ++writes === 60) broken = true;
        if (broken) throw new Error('the channel to the host is broken');
        return undefined;
      })
    );
    const dataDirectoryName = dataDirectoryNameOf(target.rxdb);

    const error = await restoreElectronPGliteDatabase(chunkedSource(bytes).stream, target).catch(
      (caught: unknown) => caught
    );

    // 连 abort 都送不到：残留还在 host 上，发起方只能报待清理。
    expect(isRxDBBackupError(error) && error.code).toBe('cleanup_pending');
    expect(isRxDBBackupError(error) && error.details).toEqual({
      field: 'dataDirectoryName',
      actual: dataDirectoryName
    });
    // 独占仍归那个失联的窗口：别的窗口连不进来，半截库不会被当成正常库。
    expect(host.host.openRestoreCount).toBe(1);
    expect(await backupErrorCode(instanceOn(dbName, host.transportFor(OTHER_OWNER)).connect())).toBe(
      'restore_in_progress'
    );

    await host.host.releaseOwner(OWNER);

    expect(host.host.openRestoreCount).toBe(0);
    expect(await host.targetState(dataDirectoryName)).toEqual({ empty: false, marker: true });
    expect(await backupErrorCode(instanceOn(dbName, host.transportFor(OTHER_OWNER)).connect())).toBe(
      'restore_incomplete'
    );
    expect(await cleanupIncompleteElectronPGliteRestore(instanceOn(dbName, host.transportFor(OTHER_OWNER)))).toBe(true);
    await restoreElectronPGliteDatabase(
      chunkedSource(bytes).stream,
      instanceOn(dbName, host.transportFor(OTHER_OWNER))
    );
    expect(await readAll(host, dbName)).toEqual(SEEDED_NOTES);
  });

  it('keeps the original failure and surfaces the abort failure when abort breaks before the marker', async () => {
    const host = start();
    const dbName = uniqueDbName('electron-pg-dst');
    const channelError = new Error('the channel to the host is broken');
    const target = instanceOn(
      dbName,
      interceptTransport(host.transportFor(OWNER), payload => {
        if (payload.kind === 'pg.restore.abort') throw channelError;
        return undefined;
      })
    );
    const dataDirectoryName = dataDirectoryNameOf(target.rxdb);

    const error = await restoreElectronPGliteDatabase(chunkedSource(new Uint8Array(64)).stream, target).catch(
      (caught: unknown) => caught
    );

    // 标记还没写：盘上没有残留，不该报 cleanup_pending，原始失败的码照旧；abort 的失败也不能丢。
    expect(isRxDBBackupError(error) && error.code).toBe('corrupt_archive');
    const cause = isRxDBBackupError(error) ? error.cause : undefined;
    expect(cause).toBeInstanceOf(AggregateError);
    const [original, cleanup] = (cause as AggregateError).errors;
    expect(isRxDBBackupError(original, 'corrupt_archive')).toBe(true);
    expect(cleanup).toBe(channelError);
    // abort 没送到：独占仍归这个窗口，窗口一走 host 就交还，目标照样是空的。
    expect(host.host.openRestoreCount).toBe(1);

    await host.host.releaseOwner(OWNER);

    await expectCleanTarget(host, dataDirectoryName);
  });

  for (const skew of [-1, 1]) {
    it(`refuses a host that speaks protocol ${DESKTOP_PGLITE_PROTOCOL_VERSION + skew} before reading the archive`, async () => {
      const { bytes } = await seededArchive();
      const host = start();
      const kinds: string[] = [];
      const target = instanceOn(
        uniqueDbName('electron-pg-dst'),
        skewHandshake(host.transportFor(OWNER), DESKTOP_PGLITE_PROTOCOL_VERSION + skew, kinds)
      );
      const dataDirectoryName = dataDirectoryNameOf(target.rxdb);
      const source = chunkedSource(bytes);

      const error = await restoreElectronPGliteDatabase(source.stream, target).catch((caught: unknown) => caught);

      expect(isRxDBBackupError(error) && error.code).toBe('unsupported_combination');
      expect(isRxDBBackupError(error) && error.details).toEqual({
        field: 'protocolVersion',
        expected: DESKTOP_PGLITE_PROTOCOL_VERSION
      });
      // 握手之后什么都没发：没读归档、没取独占、没建目录。
      expect(kinds).toEqual(['pg.handshake']);
      expect(source.probe).toEqual({ pulledBytes: 0, cancelled: true });
      expect(existsSync(host.directoryOf(dataDirectoryName))).toBe(false);
      expect(await backupErrorCode(cleanupIncompleteElectronPGliteRestore(target))).toBe('unsupported_combination');
      expect(kinds).toEqual(['pg.handshake', 'pg.handshake']);
    });
  }
});
