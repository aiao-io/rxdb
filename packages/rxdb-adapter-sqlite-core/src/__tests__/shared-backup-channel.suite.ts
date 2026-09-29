/**
 * US-217 AC#21：大型归档经 renderer / host 通道传输时的背压、断开与协议不兼容。
 *
 * @remarks
 * 每条用例起一个专用 host（{@link SqliteBackupHarness.channelHost}），它的传输层被这里的计量通道包住：
 * 数得出在途请求与最大消息，也能在指定请求上停住应答、丢掉请求或应答、改写握手。归档是 64 条各 128 KiB
 * 不可压缩负载的笔记，逻辑行数据约 8 MiB，是消息预算的四倍以上——整份归档要是被包成一条消息，预算断言就会失败。
 *
 * - 背压：host 应答慢时 renderer 不再往 sink 写；sink 慢时 renderer 不再向 host 要行；恢复时 host 慢，输入流不被往下读。
 * - 断开：请求或应答在途中丢失、host 进程被杀，操作以 `io_error` 结束（通道失败与归档损坏可判别），sink 被 abort，
 *   输入流被取消；源库照常读写，恢复目标退回从未恢复过的状态。通道彻底断掉时连清理也做不了，报 `cleanup_pending`，
 *   host 退出后由别的连接清理。
 * - 协议不兼容：握手版本对不上时，在打开目标之前拒绝，目标一个字节都没动、输入流一个字节都没读。
 *
 * 浏览器后端的库与测试同在一个页面，没有 renderer / host 通道，给出原因跳过。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../desktop/desktop-host-protocol.js';
import type { DesktopHostTransport } from '../desktop/desktop-sqlite-client.js';
import type { ForeignSqliteHost, SqliteBackupHarness } from '../testing.js';
import {
  backupErrorCode,
  chunkedSource,
  CLEAN_TARGET,
  collectingSink,
  createBackupRxDB,
  makeNote,
  persistentTargetState,
  PLAIN_ENTITIES,
  readNotes,
  restoreInto,
  uniqueDbName,
  type BackupRxDB
} from './backup/sqlite-backup-fixture.js';

const KIB = 1024;
const MIB = 1024 * KIB;

/** 笔记条数与每条的不可压缩负载。 */
const NOTES = 64;
const PAYLOAD_BYTES = 128 * KIB;

/** 单条通道消息（请求或应答）的上限：远小于归档，证明归档是分片走的通道。 */
const MESSAGE_BUDGET = 2 * MIB;

/** 等一段时间，确认这段时间里什么都没发生。 */
const QUIET_MS = 100;
/** 停住之后先等队列里已经交出去的那一块落定，再开始观察。 */
const SETTLE_MS = 30;

type HostRequest = Parameters<DesktopHostTransport['request']>[0];

/** 通道故障注入点；抛错即丢掉这条请求（`beforeSend`）或它的应答（`afterReply`）。 */
interface ChannelHooks {
  /** 替 host 应答；返回 `undefined` 时照常转发。 */
  answer?: (payload: HostRequest) => unknown;
  /** 请求交给 host 之前。 */
  beforeSend?: (payload: HostRequest) => void | Promise<void>;
  /** host 已经执行、应答交回 renderer 之前；在这里等待就是一个慢 host。 */
  afterReply?: (payload: HostRequest) => void | Promise<void>;
}

/** 通道上观察到的事实。 */
interface ChannelStats {
  /** 交给 host 的请求数。 */
  sent: number;
  /** 此刻在 host 上、应答还没交回的请求数。 */
  inFlight: number;
  /** 在途请求数的峰值。 */
  maxInFlight: number;
  /** 最大一条请求或应答的估算字节数。 */
  largestMessage: number;
  /** 按顺序发出（含被替答）的请求种类。 */
  readonly kinds: string[];
}

/** 消息的估算字节数：字符串按长度、字节数组按字节数，其余标量按 8。 */
const sizeOf = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  if (value === null || typeof value !== 'object') return 8;
  return Object.values(value).reduce((sum: number, item: unknown) => sum + sizeOf(item), 0);
};

/** 计量并可注入故障的通道；`wrap` 交给 {@link SqliteBackupHarness.channelHost}。 */
const meteredChannel = () => {
  const stats: ChannelStats = { sent: 0, inFlight: 0, maxInFlight: 0, largestMessage: 0, kinds: [] };
  const hooks: ChannelHooks = {};
  const forward = async (base: DesktopHostTransport, payload: HostRequest): Promise<unknown> => {
    await hooks.beforeSend?.(payload);
    stats.sent += 1;
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    stats.largestMessage = Math.max(stats.largestMessage, sizeOf(payload));
    try {
      const reply = await base.request(payload);
      stats.largestMessage = Math.max(stats.largestMessage, sizeOf(reply));
      await hooks.afterReply?.(payload);
      return reply;
    } finally {
      stats.inFlight -= 1;
    }
  };
  const wrap = (base: DesktopHostTransport): DesktopHostTransport => {
    const ready = base.subscriptionReady?.bind(base);
    return {
      request: async payload => {
        stats.kinds.push(payload.kind);
        return hooks.answer?.(payload) ?? forward(base, payload);
      },
      subscribe: listener => base.subscribe(listener),
      ...(ready ? { subscriptionReady: ready } : {})
    };
  };
  return { stats, hooks, wrap };
};

/** 一条装着整段行数据的恢复插入语句（归档的行分段约 1 MiB，远大于建表与系统表的语句）。 */
const isRowInsert = (payload: HostRequest): boolean =>
  payload.kind === 'execute' && payload.sql.startsWith('INSERT INTO') && payload.sql.length > 256 * KIB;

/** 在第 `nth` 次满足条件时返回 `true`。 */
const nthOf = (predicate: (payload: HostRequest) => boolean, nth: number) => {
  let seen = 0;
  return (payload: HostRequest): boolean => predicate(payload) && ++seen === nth;
};

const channelClosed = (): Error => new Error('desktop host channel closed');

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(settle => {
    resolve = settle;
  });
  return { promise, resolve };
};

/** 与 `backup-memory-tools` 同一个 xorshift：不可压缩、可复现，又不必引入 `node:` 模块。 */
const noise = (size: number, seed: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  let state = seed | 1;
  for (let index = 0; index < size; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
};

/** 注册桌面后端的通道用例。 */
export const backupChannelSuite = (harness: SqliteBackupHarness): void => {
  const spawn = typeof harness.channelHost === 'function' ? harness.channelHost : undefined;
  const reason = spawn ? '' : ` (skipped: ${(harness.channelHost as { unsupported: string }).unsupported})`;

  describe.skipIf(!spawn)(`backup channel${reason}`, () => {
    const sourceName = uniqueDbName('backup-channel-source');
    let archive: Uint8Array;
    const hosts: ForeignSqliteHost[] = [];
    const instances: BackupRxDB[] = [];

    const open = (on: SqliteBackupHarness, dbName: string): BackupRxDB => {
      const db = createBackupRxDB(on, dbName, PLAIN_ENTITIES, 'persistent');
      instances.push(db);
      return db;
    };

    /** 起一个传输层被计量通道包住的专用 host。 */
    const start = () => {
      const channel = meteredChannel();
      const host = (spawn as NonNullable<typeof spawn>)(channel.wrap);
      hosts.push(host);
      return { channel, host };
    };

    const countNotes = async (db: BackupRxDB): Promise<number> =>
      (await readNotes(await db.connect(), db.entities)).length;

    /** 在共用 host 上把归档恢复进一个新库，返回读回的笔记条数。 */
    const restoredCount = async (bytes: Uint8Array): Promise<number> => {
      const target = open(harness, uniqueDbName('backup-channel-check'));
      await restoreInto(target, chunkedSource(bytes).stream);
      return countNotes(target);
    };

    beforeAll(async () => {
      const source = createBackupRxDB(harness, sourceName, PLAIN_ENTITIES, 'persistent');
      const adapter = await source.connect();
      try {
        for (let index = 0; index < NOTES; index += 1) {
          const note = makeNote(source.entities, `note-${String(index).padStart(3, '0')}`);
          note.payload = noise(PAYLOAD_BYTES, index + 1);
          await note.save();
        }
        const sink = collectingSink();
        await adapter.backup(sink.sink);
        archive = sink.bytes();
      } finally {
        await source.close();
      }
      // 行数据是消息预算的四倍以上：一条消息装不下整份归档。
      expect(NOTES * PAYLOAD_BYTES).toBeGreaterThanOrEqual(4 * MESSAGE_BUDGET);
    }, 120_000);

    afterEach(async () => {
      // host 可能已经被杀，断开失败不影响结论
      for (const db of instances.splice(0)) await db.close().catch(() => undefined);
      for (const host of hosts.splice(0)) await host.stop();
    });

    it('stops pulling rows while the host or the sink is slow and never ships the archive as one message', async () => {
      const { channel, host } = start();
      const db = open(host.harness, sourceName);
      const adapter = await db.connect();
      const expected = (await readNotes(adapter, db.entities)).length;
      // 数笔记是一次整表查询，它的应答不属于备份：只计量从这里开始的消息
      channel.stats.largestMessage = 0;

      // 一次行读取会切成十几块写给 sink，所以先卡 sink、放开后再卡 host：反过来的话 sink 会在 host 卡住之前先卡住。
      const sinkStalled = deferred();
      const sinkGate = deferred();
      const sink = collectingSink(async (_chunk, index) => {
        if (index !== 3) return;
        sinkStalled.resolve();
        await sinkGate.promise;
      });
      let slowHost = false;
      const hostStalled = deferred();
      const hostGate = deferred();
      channel.hooks.afterReply = async payload => {
        if (!slowHost || payload.kind !== 'execute') return;
        slowHost = false;
        hostStalled.resolve();
        await hostGate.promise;
      };
      const backup = adapter.backup(sink.sink);

      // sink 慢：renderer 不再向 host 要行
      await sinkStalled.promise;
      await sleep(SETTLE_MS);
      const sent = channel.stats.sent;
      expect(channel.stats.inFlight).toBe(0);
      await sleep(QUIET_MS);
      expect(channel.stats.sent).toBe(sent);
      slowHost = true;
      sinkGate.resolve();

      // host 慢：请求停在 host 上，sink 收不到新块
      await hostStalled.promise;
      await sleep(SETTLE_MS);
      const writes = sink.chunkSizes.length;
      expect(channel.stats.inFlight).toBe(1);
      await sleep(QUIET_MS);
      expect(sink.chunkSizes.length).toBe(writes);
      hostGate.resolve();

      await backup;
      expect(sink.closed()).toBe(true);
      expect(channel.stats.maxInFlight).toBe(1);
      expect(channel.stats.largestMessage).toBeLessThanOrEqual(MESSAGE_BUDGET);
      expect(await restoredCount(sink.bytes())).toBe(expected);
    }, 120_000);

    it('fails with io_error and aborts the sink when the host dies mid-backup; the source stays usable', async () => {
      const { host } = start();
      const db = open(host.harness, sourceName);
      const adapter = await db.connect();
      const expected = (await readNotes(adapter, db.entities)).length;
      const sink = collectingSink(async (_chunk, index) => {
        if (index === 3) await host.stop();
      });

      expect(await backupErrorCode(adapter.backup(sink.sink))).toBe('io_error');
      expect(sink.aborted()).toBe(true);
      expect(sink.closed()).toBe(false);

      // 源库没被半截的读事务或残留的句柄卡住：别的连接照常读写
      const source = open(harness, sourceName);
      expect(await countNotes(source)).toBe(expected);
      await makeNote(source.entities, 'written-after-host-died').save();
      expect(await countNotes(source)).toBe(expected + 1);
    }, 120_000);

    it.each(['request', 'reply'] as const)(
      'fails with io_error when a %s is lost mid-backup and backs up again on the same connection',
      async lost => {
        const { channel, host } = start();
        const db = open(host.harness, sourceName);
        const adapter = await db.connect();
        const expected = (await readNotes(adapter, db.entities)).length;
        let armed = false;
        const lose = (payload: HostRequest): void => {
          if (!armed || payload.kind !== 'execute') return;
          armed = false;
          throw channelClosed();
        };
        channel.hooks[lost === 'request' ? 'beforeSend' : 'afterReply'] = lose;
        const sink = collectingSink((_chunk, index) => {
          if (index === 3) armed = true;
        });

        expect(await backupErrorCode(adapter.backup(sink.sink))).toBe('io_error');
        expect(sink.aborted()).toBe(true);

        // 读事务已经回滚，同一条连接上的下一次备份完整成功
        const again = collectingSink();
        await adapter.backup(again.sink);
        expect(again.closed()).toBe(true);
        expect(await restoredCount(again.bytes())).toBe(expected);
      },
      120_000
    );

    it('stops reading the archive while the host is slow to apply rows', async () => {
      const { channel, host } = start();
      const target = open(host.harness, uniqueDbName('backup-channel-restore'));
      const stalled = deferred();
      const gate = deferred();
      const second = nthOf(isRowInsert, 2);
      channel.hooks.afterReply = async payload => {
        if (!second(payload)) return;
        stalled.resolve();
        await gate.promise;
      };
      const source = chunkedSource(archive);
      const restoring = restoreInto(target, source.stream);

      await stalled.promise;
      await sleep(SETTLE_MS);
      const pulled = source.probe.pulledBytes;
      expect(channel.stats.inFlight).toBe(1);
      await sleep(QUIET_MS);
      expect(source.probe.pulledBytes).toBe(pulled);
      expect(pulled).toBeLessThan(archive.byteLength);
      gate.resolve();

      await restoring;
      expect(channel.stats.maxInFlight).toBe(1);
      expect(channel.stats.largestMessage).toBeLessThanOrEqual(MESSAGE_BUDGET);
      expect(await countNotes(target)).toBe(NOTES);
    }, 120_000);

    it.each(['request', 'reply'] as const)(
      'fails with io_error, not corrupt_archive, when a %s is lost mid-restore and leaves the target clean',
      async lost => {
        const { channel, host } = start();
        const dbName = uniqueDbName('backup-channel-lost');
        const target = open(host.harness, dbName);
        const second = nthOf(isRowInsert, 2);
        channel.hooks[lost === 'request' ? 'beforeSend' : 'afterReply'] = payload => {
          if (second(payload)) throw channelClosed();
        };
        const source = chunkedSource(archive);

        expect(await backupErrorCode(restoreInto(target, source.stream))).toBe('io_error');
        expect(source.probe.cancelled).toBe(true);
        expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);

        const retry = open(harness, dbName);
        await restoreInto(retry, chunkedSource(archive).stream);
        expect(await countNotes(retry)).toBe(NOTES);
      },
      120_000
    );

    it('reports cleanup_pending when the channel stays down, and another connection cleans up after the host exits', async () => {
      const { channel, host } = start();
      const dbName = uniqueDbName('backup-channel-down');
      const target = open(host.harness, dbName);
      let down = false;
      channel.hooks.beforeSend = payload => {
        down ||= isRowInsert(payload);
        if (down) throw channelClosed();
      };
      const source = chunkedSource(archive);

      expect(await backupErrorCode(restoreInto(target, source.stream))).toBe('cleanup_pending');
      expect(source.probe.cancelled).toBe(true);

      // host 退出才放开它持有的独占锁；之后别的连接看到标记，清掉残留
      await host.stop();
      const cleaner = open(harness, dbName);
      expect(await (await cleaner.adapter()).cleanupIncompleteRestore()).toBe(true);
      expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);
    }, 120_000);

    it.each([-1, 1])(
      'refuses a restore before touching the target when the host protocol is off by %i',
      async skew => {
        const { channel, host } = start();
        const dbName = uniqueDbName('backup-channel-skew');
        const target = open(host.harness, dbName);
        channel.hooks.answer = payload =>
          payload.kind === 'handshake' ?
            { kind: 'handshake', result: { protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION + skew } }
          : undefined;
        const source = chunkedSource(archive);

        const error = await restoreInto(target, source.stream).then(
          () => undefined,
          (failure: unknown) => failure
        );
        expect(error).toMatchObject({
          code: 'unsupported_combination',
          details: { field: 'protocolVersion', expected: DESKTOP_HOST_PROTOCOL_VERSION }
        });
        expect(channel.stats.kinds).toEqual(['handshake']);
        expect(source.probe).toEqual({ pulledBytes: 0, cancelled: true });
        expect(await persistentTargetState(harness, dbName)).toEqual(CLEAN_TARGET);
      },
      60_000
    );
  });
};
