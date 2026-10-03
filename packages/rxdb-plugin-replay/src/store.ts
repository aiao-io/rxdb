import type { LocalRxDBAdapter, RxDB, TransactionExecutor } from '@aiao/rxdb';
import type { eventWithTime } from '@rrweb/types';
import { REPLAY_ENTITIES, ReplayEventRecord, ReplaySessionRecord } from './entities.js';
import { RxDBReplayError } from './errors.js';
import {
  createReplayMarkerEvent,
  eventBytes,
  REPLAY_CUSTOM_EVENT_TYPE,
  REPLAY_MARKER_TAGS,
  type ReplayTruncatedCode
} from './markers.js';
import type { ReplayRecordingDbFactory, ResolvedReplayOptions } from './options.js';
import type { ReplayEventRange, ReplaySessionInfo } from './types.js';

/** 一条待落库事件：`seq` 由录制器在 `emit` 时分配，会话内严格递增。 */
export interface ReplayEventEntry {
  readonly seq: number;
  readonly event: eventWithTime;
}

/** 会话概要外加续录要用的 `nextSeq`（只在包内流转，不进公开类型）。 */
export interface ReplayStoredSession extends ReplaySessionInfo {
  readonly nextSeq: number;
}

/** {@link ReplayStore.appendBatch} 的结果。 */
export type ReplayAppendResult =
  | { readonly kind: 'written'; readonly nextSeq: number }
  | { readonly kind: 'truncated'; readonly code: ReplayTruncatedCode; readonly limitBytes: number };

/** {@link ReplayStore} 的构造参数。 */
export interface ReplayStoreOptions {
  readonly createRecordingDb: ReplayRecordingDbFactory;
  readonly limits: ResolvedReplayOptions['limits'];
}

interface OpenRecordingDb {
  readonly db: RxDB;
  readonly adapter: LocalRxDBAdapter;
}

const ALL = { combinator: 'and', rules: [] } as const;

const bySessionId = (sessionId: string) =>
  ({ combinator: 'and', rules: [{ field: 'sessionId', operator: '=', value: sessionId }] }) as const;

/** 只取公开字段（会话行与包内的 {@link ReplayStoredSession} 都多出 `nextSeq`）。 */
export const toInfo = (row: ReplaySessionInfo): ReplaySessionInfo => ({
  id: row.id,
  startedAt: row.startedAt,
  lastEventAt: row.lastEventAt,
  status: row.status,
  truncatedCode: row.truncatedCode,
  eventCount: row.eventCount,
  bytes: row.bytes
});

const findSessionRow = async (executor: TransactionExecutor, sessionId: string) => {
  const [row] = await executor.getRepository(ReplaySessionRecord).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: sessionId }] },
    limit: 1
  });
  return row ?? null;
};

const requireSessionRow = async (executor: TransactionExecutor, sessionId: string) => {
  const row = await findSessionRow(executor, sessionId);
  if (row === null) throw new RxDBReplayError('session_not_found', `session "${sessionId}" does not exist`);
  return row;
};

const totalBytes = async (executor: TransactionExecutor): Promise<number> => {
  const rows = await executor.getRepository(ReplaySessionRecord).find({ where: ALL });
  return rows.reduce((sum, row) => sum + row.bytes, 0);
};

/**
 * 录制库：会话行与事件行的全部读写。
 *
 * @remarks
 * - **懒建**：第一次存储调用才调工厂并 `connect()`；并发的首调共用同一次打开。打开失败抛
 *   `recording_db_unavailable`（`cause` 为原错误）并复位，下一次调用重新调工厂。
 * - **同进同退**：会话行的 `bytes` / `eventCount` / `nextSeq` / `lastEventAt` 只在写事件行的同一事务里推进，
 *   续录据此判断在途那批落没落（`specs/005-us-909-session-replay/research.md` D3）。
 * - **上限**：判定与写入同一事务；超限整批不写，只落一条 `truncated` 标记（同上 D4）。从不自动删除。
 */
export class ReplayStore {
  readonly #createRecordingDb: ReplayRecordingDbFactory;
  readonly #limits: ResolvedReplayOptions['limits'];
  #opening: Promise<OpenRecordingDb> | null = null;
  #destroyed = false;

  constructor(options: ReplayStoreOptions) {
    this.#createRecordingDb = options.createRecordingDb;
    this.#limits = options.limits;
  }

  /**
   * 建一个 `recording` 会话。
   *
   * @throws `RxDBReplayError('store_limit')`：已落库总量 ≥ `limits.storeBytes`
   */
  async createSession(startedAt: Date): Promise<string> {
    return this.#transaction(async (executor, db) => {
      const total = await totalBytes(executor);
      if (total >= this.#limits.storeBytes) {
        throw new RxDBReplayError(
          'store_limit',
          `recording store holds ${total} bytes, limit is ${this.#limits.storeBytes}; delete sessions to free space`
        );
      }
      const row = db.entityManager.instantiate(ReplaySessionRecord);
      row.id = crypto.randomUUID();
      row.startedAt = startedAt;
      row.lastEventAt = null;
      row.status = 'recording';
      row.truncatedCode = null;
      row.eventCount = 0;
      row.bytes = 0;
      row.nextSeq = 0;
      await executor.saveMany([row]);
      return row.id;
    });
  }

  /**
   * 把一批事件落库，并在同一事务推进会话行。
   *
   * @param entries - `seq` 严格递增、不早于会话 `nextSeq` 的事件；重复 `seq` 被主键拒绝，整批回滚
   * @returns 写入后的 `nextSeq`；超限时整批不写，只在首个 `seq` 上落 `truncated` 标记并把会话置为终态
   * @throws `RxDBReplayError('session_not_found')`
   */
  async appendBatch(sessionId: string, entries: readonly ReplayEventEntry[]): Promise<ReplayAppendResult> {
    return this.#transaction(async (executor, db) => {
      const session = await requireSessionRow(executor, sessionId);
      if (session.status !== 'recording') {
        throw new Error(`[rxdb-plugin-replay] session "${sessionId}" is ${session.status}, not recording`);
      }
      const [first] = entries;
      if (first === undefined) return { kind: 'written', nextSeq: session.nextSeq };

      const rows = entries.map(entry => this.#eventRow(db, sessionId, entry));
      const batchBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
      const exceeded = await this.#exceededLimit(executor, session, batchBytes);
      if (exceeded !== null) {
        await this.#truncate(executor, db, session, first, exceeded);
        return { kind: 'truncated', ...exceeded };
      }

      await executor.saveMany(rows);
      const last = rows[rows.length - 1] as ReplayEventRecord;
      await executor.getRepository(ReplaySessionRecord).update(session, {
        bytes: session.bytes + batchBytes,
        eventCount: session.eventCount + rows.length,
        nextSeq: last.seq + 1,
        lastEventAt: new Date(Math.max(...rows.map(row => row.timestamp)))
      });
      return { kind: 'written', nextSeq: last.seq + 1 };
    });
  }

  /** 把会话置为 `stopped`。 */
  async markStopped(sessionId: string): Promise<void> {
    await this.#transaction(async executor => {
      const session = await requireSessionRow(executor, sessionId);
      await executor.getRepository(ReplaySessionRecord).update(session, { status: 'stopped' });
    });
  }

  /** 读一个会话；不存在时 `null`。 */
  async getSession(sessionId: string): Promise<ReplayStoredSession | null> {
    return this.#transaction(async executor => {
      const row = await findSessionRow(executor, sessionId);
      return row === null ? null : { ...toInfo(row), nextSeq: row.nextSeq };
    });
  }

  /** 全部会话，`startedAt` 倒序。 */
  async listSessions(): Promise<ReplaySessionInfo[]> {
    return this.#transaction(async executor => {
      const rows = await executor.getRepository(ReplaySessionRecord).find({
        where: ALL,
        orderBy: [{ field: 'startedAt', sort: 'desc' }]
      });
      return rows.map(toInfo);
    });
  }

  /**
   * 读一个会话的事件，`seq` 升序；给了区间则只读 `timestamp` 落在闭区间内的。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  async readEvents(sessionId: string, range?: ReplayEventRange): Promise<eventWithTime[]> {
    return this.#transaction(async executor => {
      await requireSessionRow(executor, sessionId);
      const rangeRules =
        range ?
          ([
            { field: 'timestamp', operator: '>=', value: range.from },
            { field: 'timestamp', operator: '<=', value: range.to }
          ] as const)
        : [];
      const rows = await executor.getRepository(ReplayEventRecord).find({
        where: { combinator: 'and', rules: [...bySessionId(sessionId).rules, ...rangeRules] },
        orderBy: [{ field: 'seq', sort: 'asc' }]
      });
      return rows.map(row => row.data);
    });
  }

  /**
   * 读一个会话里的 rrweb `Custom` 事件（带 `seq`，升序）；commit 标记从这里解析。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  async readCustomEntries(sessionId: string): Promise<ReplayEventEntry[]> {
    return this.#transaction(async executor => {
      await requireSessionRow(executor, sessionId);
      const rows = await executor.getRepository(ReplayEventRecord).find({
        where: {
          combinator: 'and',
          rules: [...bySessionId(sessionId).rules, { field: 'type', operator: '=', value: REPLAY_CUSTOM_EVENT_TYPE }]
        },
        orderBy: [{ field: 'seq', sort: 'asc' }]
      });
      return rows.map(row => ({ seq: row.seq, event: row.data }));
    });
  }

  /**
   * 删除会话及其全部事件（同一事务，先事件后会话）。
   *
   * @throws `RxDBReplayError('session_not_found')`
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.#transaction(async executor => {
      const session = await requireSessionRow(executor, sessionId);
      const events = await executor.getRepository(ReplayEventRecord).find({ where: bySessionId(sessionId) });
      if (events.length > 0) await executor.removeMany(events);
      await executor.removeMany([session]);
    });
  }

  /** 录制库当前用量。 */
  async usage(): Promise<{ bytes: number; sessionCount: number }> {
    return this.#transaction(async executor => {
      const rows = await executor.getRepository(ReplaySessionRecord).find({ where: ALL });
      return { bytes: rows.reduce((sum, row) => sum + row.bytes, 0), sessionCount: rows.length };
    });
  }

  /**
   * 销毁录制库；之后的调用抛 `not_installed`。没打开过就什么都不做（不为销毁去调工厂）。
   */
  async destroy(): Promise<void> {
    this.#destroyed = true;
    const opening = this.#opening;
    this.#opening = null;
    if (opening === null) return;
    // 打开失败的那一次已经在 #open 里收拾过，这里不再有库可销毁。
    const opened = await opening.catch(() => null);
    if (opened !== null) await opened.db.destroy();
  }

  async #transaction<T>(fun: (executor: TransactionExecutor, db: RxDB) => Promise<T>): Promise<T> {
    const { db, adapter } = await this.#ensureOpen();
    return adapter.transaction(executor => fun(executor, db), false);
  }

  #ensureOpen(): Promise<OpenRecordingDb> {
    if (this.#destroyed) {
      return Promise.reject(new RxDBReplayError('not_installed', 'recording store is destroyed'));
    }
    if (this.#opening === null) {
      const opening = this.#open();
      this.#opening = opening;
      opening.catch(() => {
        if (this.#opening === opening) this.#opening = null;
      });
    }
    return this.#opening;
  }

  async #open(): Promise<OpenRecordingDb> {
    let db: RxDB;
    try {
      db = await this.#createRecordingDb(REPLAY_ENTITIES);
    } catch (error) {
      throw new RxDBReplayError('recording_db_unavailable', 'createRecordingDb threw', { cause: error });
    }
    try {
      const adapterName = db.config.sync.local?.adapter;
      if (adapterName === undefined) throw new Error('recording db has no sync.local.adapter');
      await db.connect(adapterName);
      return { db, adapter: db.localAdapterSync };
    } catch (error) {
      // 报的是连接失败本身；销毁只是收拾半开的库，它再失败也不该盖住原因。
      await db.destroy().catch(() => undefined);
      throw new RxDBReplayError('recording_db_unavailable', 'recording db failed to connect', { cause: error });
    }
  }

  #eventRow(db: RxDB, sessionId: string, entry: ReplayEventEntry): ReplayEventRecord {
    const row = db.entityManager.instantiate(ReplayEventRecord);
    row.id = `${sessionId}:${entry.seq}`;
    row.sessionId = sessionId;
    row.seq = entry.seq;
    row.type = entry.event.type;
    row.timestamp = entry.event.timestamp;
    row.data = entry.event;
    row.bytes = eventBytes(entry.event);
    return row;
  }

  async #exceededLimit(
    executor: TransactionExecutor,
    session: ReplaySessionRecord,
    batchBytes: number
  ): Promise<{ code: ReplayTruncatedCode; limitBytes: number } | null> {
    if (session.bytes + batchBytes > this.#limits.sessionBytes) {
      return { code: 'session_limit', limitBytes: this.#limits.sessionBytes };
    }
    if ((await totalBytes(executor)) + batchBytes > this.#limits.storeBytes) {
      return { code: 'store_limit', limitBytes: this.#limits.storeBytes };
    }
    return null;
  }

  async #truncate(
    executor: TransactionExecutor,
    db: RxDB,
    session: ReplaySessionRecord,
    first: ReplayEventEntry,
    exceeded: { code: ReplayTruncatedCode; limitBytes: number }
  ): Promise<void> {
    const marker = createReplayMarkerEvent(REPLAY_MARKER_TAGS.truncated, exceeded, first.event.timestamp);
    const row = this.#eventRow(db, session.id, { seq: first.seq, event: marker });
    await executor.saveMany([row]);
    await executor.getRepository(ReplaySessionRecord).update(session, {
      status: 'truncated',
      truncatedCode: exceeded.code,
      bytes: session.bytes + row.bytes,
      eventCount: session.eventCount + 1,
      nextSeq: first.seq + 1,
      lastEventAt: new Date(marker.timestamp)
    });
  }
}
