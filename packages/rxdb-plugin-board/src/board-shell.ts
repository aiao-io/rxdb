/**
 * @fileoverview 看板宿主外壳编排（US-537 宿主半边 / US-539 AC#4 / #5）
 *
 * 启动选择、活动位置、恢复到新库名后整页重载读回、跨页面「恢复中」与活动位置变更重载。
 * 三端外壳组件（Angular `BoardShellComponent`、React / Vue `BoardShell`）与独立 demo 共用这一份编排，
 * 组件只渲染 {@link BoardShellState} 并转发用户动作；状态转换走 {@link restoreStateMachine}。
 */

import type { IRxDBAdapter, RxDB } from '@aiao/rxdb';
import { BehaviorSubject, firstValueFrom, type Observable } from 'rxjs';

import {
  ACTIVE_DB_KEY,
  nextRestoreDbName,
  PENDING_SWITCH_KEY,
  RESTORE_TARGET_KEY,
  RESTORING_MARKER_KEY,
  type BoardStorage
} from './board-storage.js';
import { Board } from './entities/board.entity.js';
import { matchAll } from './query.js';
import {
  initialRestoreSnapshot,
  restoreStateMachine,
  type RestoreInput,
  type RestoreSnapshot
} from './restore-machine.js';

/** 恢复、启动读回与残留清理共用的跨页面锁名。 */
export const BOARD_RESTORE_LOCK = 'rxdb-board:restore';

/** 外壳阶段：启动选择 / 准备或连接中 / 恢复中（含重载后的读回）/ 看板。 */
export type BoardShellPhase = 'startup' | 'loading' | 'restoring' | 'board';

/** 待用户确认的外壳操作（应用内确认对话框，不用浏览器原生弹窗）。 */
export interface BoardShellConfirm {
  /** 对话框标题。 */
  readonly title: string;
  /** 确认之后会发生什么（一句话）。 */
  readonly message: string;
  /** 确认按钮文字。 */
  readonly confirmLabel: string;
}

/** 外壳状态快照：外壳组件只渲染它。 */
export interface BoardShellState {
  /** 当前阶段：组件据此切换启动页 / 准备中 / 恢复中 / 看板。 */
  readonly phase: BoardShellPhase;
  /** 当前打开的看板实例；只在 `board` 阶段交给看板视图。 */
  readonly rxdb: RxDB | null;
  /** 最近一次失败的说明（启动页与看板页都显示）；成功打开新库后清除。 */
  readonly error: string | null;
  /** 待确认的操作；`null` 表示没有确认对话框。 */
  readonly confirm: BoardShellConfirm | null;
  /** 本页发起的恢复流程快照；重载后按待切换记录重建为「切换中」。 */
  readonly restore: RestoreSnapshot;
  /** 宿主提供了演示数据：显示「装载演示数据 / 重置为演示数据」。 */
  readonly canSeed: boolean;
}

/** 支持备份 / 恢复的本地适配器（US-217 公开方法的子集；sqlite 系适配器都有）。 */
export interface BoardBackupAdapter {
  /** 生成完整归档写进 `sink`；归档完整写出、输出端关闭后才返回。 */
  backup(sink: WritableStream<Uint8Array>): Promise<unknown>;
  /** 恢复进未连接的空目标（必须在 `rxdb.connect()` 之前）。 */
  restore(source: ReadableStream<Uint8Array>): Promise<unknown>;
  /** 清理没做完的恢复；确实清理了残留时为 `true`。 */
  cleanupIncompleteRestore(): Promise<boolean>;
  /** 删除本库的持久存储（未连接时）。 */
  dropStorage(): Promise<void>;
}

/** 外壳依赖的浏览器能力；默认 {@link browserBoardShellRuntime}，测试注入内存实现。 */
export interface BoardShellRuntime {
  /** 活动位置 / 待切换 / 恢复目标 / 恢复中标记的存储（浏览器为 `localStorage`）。 */
  readonly storage: BoardStorage;
  /**
   * 跨页面互斥：恢复、启动读回与残留清理共用一把锁。
   * `wait` 为 `false` 时拿不到锁立即报错（另一页面正在准备或恢复）。
   */
  withLock<T>(operation: () => Promise<T>, wait: boolean): Promise<T>;
  /** 现存库的逻辑库名：新库名避让、恢复目标是否存在。 */
  listDatabases(): Promise<readonly string[]>;
  /** 其他页面改写存储时回调（浏览器 `storage` 事件）；返回退订函数。 */
  watchStorage(listener: (key: string | null, value: string | null) => void): () => void;
  /** 整页重载（切库只走整页重载，US-537 技术笔记）。 */
  reload(): void;
  /** 把归档交给浏览器下载。 */
  download(archive: Blob, fileName: string): void;
}

/** {@link BoardShellController} 的宿主配置。 */
export interface BoardShellOptions {
  /**
   * 按库名建一个**尚未连接**的看板实例：实体、插件与名为 {@link BoardShellOptions.adapterName} 的本地适配器由宿主装好，
   * 库名由外壳分配。适配器须支持备份 / 恢复（{@link BoardBackupAdapter}）；首轮支持组合是 sqlite-wasm 主线程
   * `vfs: 'idb'`（US-537）。
   */
  readonly createRxdb: (dbName: string) => RxDB;
  /** 本地适配器名（`rxdb.adapter(name, …)` 注册的那个）。 */
  readonly adapterName: string;
  /** 演示数据装载函数（如 `seedReleaseBoardDataset`）；不传则不提供演示数据入口。 */
  readonly seed?: (rxdb: RxDB) => Promise<void>;
  /** 浏览器能力（默认 {@link browserBoardShellRuntime}）。 */
  readonly runtime?: BoardShellRuntime;
}

const failureMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** 装载演示数据的目标原本就有看板（库名列表过时）：它不是本次新建的库，失败清理时不能删。 */
class ExistingBoardDatabaseError extends Error {}

const isBackupAdapter = (
  adapter: IRxDBAdapter & Partial<BoardBackupAdapter>
): adapter is IRxDBAdapter & BoardBackupAdapter =>
  typeof adapter.backup === 'function' &&
  typeof adapter.restore === 'function' &&
  typeof adapter.cleanupIncompleteRestore === 'function' &&
  typeof adapter.dropStorage === 'function';

/**
 * RxDB 物理库名是 `<dbName>@<后缀>`（见 RxDB 构造器），IndexedDB 后端在其后再拼存储后缀
 * （sqlite-wasm `idb` 为 `<dbName>@<后缀>.sqlite.db`）：`@` 之前即逻辑库名。
 */
const logicalDbName = (indexedDbName: string): string => indexedDbName.split('@')[0];

/**
 * 浏览器能力：`localStorage`、Web Locks、IndexedDB 库名列表、`storage` 事件与整页重载。
 *
 * @returns 外壳运行时
 *
 * @remarks
 * 库名列表取 IndexedDB——首轮支持组合（sqlite-wasm 主线程 `vfs: 'idb'`）的存储在那里。
 * 其他存储（OPFS 等）的宿主自己实现 {@link BoardShellRuntime.listDatabases}。
 */
export const browserBoardShellRuntime = (): BoardShellRuntime => ({
  storage: {
    get: key => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: key => localStorage.removeItem(key)
  },
  withLock: (operation, wait) =>
    navigator.locks.request(BOARD_RESTORE_LOCK, { ifAvailable: !wait }, lock => {
      if (lock === null) throw new Error('另一页面正在准备或恢复看板，请稍后重试');
      return operation();
    }),
  listDatabases: async () =>
    (await indexedDB.databases())
      .map(info => info.name ?? '')
      .filter(name => name !== '')
      .map(logicalDbName),
  watchStorage: listener => {
    const onStorage = (event: StorageEvent): void => {
      if (event.storageArea === localStorage) listener(event.key, event.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
  reload: () => window.location.reload(),
  download: (archive, fileName) => {
    const url = URL.createObjectURL(archive);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // 点击触发的下载对 blob URL 的读取是异步的，立即回收会让部分浏览器中断下载或拿到空文件
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

/**
 * 看板宿主外壳编排（US-537 状态流的宿主半边）。
 *
 * - 启动选择：没有活动位置记录时停在 `startup`，选择前不连接、不建表、不装种子；
 * - 新建 / 装载演示数据 / 重置为演示数据：都在新库名上建库，成功才写活动位置；
 * - 恢复：已有看板先确认；恢复到新库名 → 写待切换记录 → 整页重载 → 读回成功才写活动位置，失败保留原库；
 * - 跨页面：恢复中标记让其他页面的看板视图暂停写入；活动位置被别的页面改写时本页重载。
 *
 * @remarks
 * 恢复、启动读回与残留清理在 {@link BOARD_RESTORE_LOCK} 下串行；用户动作拿不到锁立即报错，启动读回等锁。
 * {@link BoardShellController.destroy} 之后到达的连接一律断开、状态不再变化（React StrictMode 的双挂载）。
 */
export class BoardShellController {
  readonly #options: BoardShellOptions;
  readonly #runtime: BoardShellRuntime;
  readonly #state$: BehaviorSubject<BoardShellState>;
  #activeDbName: string | null = null;
  #settleConfirm: ((confirmed: boolean) => void) | null = null;
  #unwatch: (() => void) | null = null;
  #destroyed = false;

  /** 外壳状态流（立即发出当前快照）。 */
  readonly state$: Observable<BoardShellState>;

  /** 当前状态快照。 */
  get state(): BoardShellState {
    return this.#state$.value;
  }

  /**
   * @param options - 宿主配置：实例工厂、适配器名、可选的演示数据与运行时
   */
  constructor(options: BoardShellOptions) {
    this.#options = options;
    this.#runtime = options.runtime ?? browserBoardShellRuntime();
    this.#state$ = new BehaviorSubject<BoardShellState>({
      phase: 'loading',
      rxdb: null,
      error: null,
      confirm: null,
      restore: initialRestoreSnapshot,
      canSeed: options.seed !== undefined
    });
    this.state$ = this.#state$.asObservable();
  }

  /**
   * 启动：订阅活动位置变更，按记录完成待切换、清理中断的恢复、打开活动库或停在启动选择。
   *
   * @returns 启动流程结束（失败已写进 {@link BoardShellState.error}，不抛出）
   */
  async start(): Promise<void> {
    if (this.#destroyed) return;
    this.#unwatch = this.#runtime.watchStorage(this.#onStorage);
    this.#patch({ phase: this.#read(RESTORING_MARKER_KEY) === null ? 'loading' : 'restoring' });
    try {
      await this.#runtime.withLock(() => this.#initialize(), true);
    } catch (cause) {
      this.#showFailure(cause);
    }
  }

  /** 启动选择「新建空看板」：在新库名上建库并打开。 */
  startEmpty(): Promise<void> {
    return this.#prepareBoard(false);
  }

  /** 启动选择「装载演示数据」：在新库名上建库、装载种子并打开。 */
  startSeed(): Promise<void> {
    return this.#prepareBoard(true);
  }

  /** 工具菜单「重置为演示数据」：确认后在新库名上装载种子并切过去，当前看板留在原库。 */
  async resetDemo(): Promise<void> {
    const confirmed = await this.#ask({
      title: '重置为演示数据',
      message: '将在新库上装载演示数据，成功后打开演示看板；当前看板留在原库。',
      confirmLabel: '重置'
    });
    if (confirmed) await this.#prepareBoard(true);
  }

  /**
   * 从备份恢复：已有看板先确认；恢复到新库名后整页重载，读回成功才切换（US-537）。
   *
   * @param archive - 用户选择的 `.rxdb` 归档
   */
  async restoreFromFile(archive: Blob): Promise<void> {
    if (
      this.#activeDbName !== null &&
      !(await this.#ask({
        title: '从备份恢复',
        message: '恢复成功后将打开备份中的看板，当前看板原样保留。',
        confirmLabel: '恢复'
      }))
    ) {
      return;
    }
    try {
      await this.#runtime.withLock(() => this.#restoreAndSwitch(archive), false);
    } catch (cause) {
      this.#showFailure(cause);
    }
  }

  /**
   * 回应确认对话框。
   *
   * @param confirmed - 用户点了确认为 `true`，取消或关闭为 `false`
   */
  settleConfirm(confirmed: boolean): void {
    const settle = this.#settleConfirm;
    this.#settleConfirm = null;
    this.#patch({ confirm: null });
    settle?.(confirmed);
  }

  /**
   * 导出当前看板：归档完整生成后才交给浏览器下载（看板视图的导出回调）。
   *
   * @throws Error 没有打开的看板；适配器不支持备份
   */
  async downloadBackup(): Promise<void> {
    const db = this.state.rxdb;
    if (db === null) throw new Error('当前没有打开的看板');
    const adapter = await this.#backupAdapter(db);
    const chunks: Uint8Array[] = [];
    await adapter.backup(
      new WritableStream<Uint8Array>({
        write: chunk => void chunks.push(chunk)
      })
    );
    this.#runtime.download(new Blob(chunks as BlobPart[]), `board-backup-${db.config.dbName}.rxdb`);
  }

  /**
   * 拆除：退订存储事件、取消待确认的操作、断开当前看板连接；之后的状态变化一律忽略。
   *
   * @throws 断开失败时抛出原错误（由组件记录）
   */
  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unwatch?.();
    this.#settleConfirm?.(false);
    this.#settleConfirm = null;
    await this.state.rxdb?.disconnectAll();
  }

  // ---------- 启动 ----------

  async #initialize(): Promise<void> {
    const pending = this.#read(PENDING_SWITCH_KEY);
    if (pending !== null) return this.#completePendingSwitch(pending);
    const cleanupFailure = await this.#cleanupInterruptedRestore();
    if (cleanupFailure !== null) this.#patch({ error: cleanupFailure });
    const active = this.#read(ACTIVE_DB_KEY);
    if (active !== null) return this.#openBoard(active);
    this.#patch({ phase: 'startup' });
  }

  readonly #onStorage = (key: string | null, value: string | null): void => {
    if (key !== ACTIVE_DB_KEY || value === null || value === this.#activeDbName) return;
    this.#patch({ phase: 'loading' });
    this.#runtime.reload();
  };

  // ---------- 新建 / 演示数据 ----------

  async #prepareBoard(seed: boolean): Promise<void> {
    this.#patch({ phase: 'loading' });
    try {
      await this.#runtime.withLock(async () => this.#openAndWriteActive(await this.#nextDbName(), seed), false);
    } catch (cause) {
      this.#showFailure(cause);
    }
  }

  async #openAndWriteActive(dbName: string, seed: boolean): Promise<void> {
    const db = this.#options.createRxdb(dbName);
    try {
      await db.connect(this.#options.adapterName);
      if (seed) await this.#seed(db);
      this.#write(ACTIVE_DB_KEY, dbName);
    } catch (cause) {
      const disconnectFailure = await this.#disconnectFailure(db, '看板连接释放失败');
      const cleanupFailure = cause instanceof ExistingBoardDatabaseError ? null : await this.#dropNewDatabase(dbName);
      this.#showFailure([failureMessage(cause), disconnectFailure, cleanupFailure].filter(Boolean).join('；'));
      return;
    }
    this.#patch({ error: null });
    await this.#activateBoard(dbName, db);
  }

  async #seed(db: RxDB): Promise<void> {
    const seed = this.#options.seed;
    if (seed === undefined) throw new Error('宿主没有提供演示数据');
    const boards = await firstValueFrom(db.entityManager.getRepository(Board).count({ where: matchAll() }));
    if (boards > 0) throw new ExistingBoardDatabaseError('演示数据只能装进新库');
    await seed(db);
  }

  async #openBoard(dbName: string): Promise<void> {
    this.#patch({ phase: 'loading' });
    const db = this.#options.createRxdb(dbName);
    try {
      await db.connect(this.#options.adapterName);
    } catch (cause) {
      const disconnectFailure = await this.#disconnectFailure(db, '看板连接释放失败');
      this.#showFailure([failureMessage(cause), disconnectFailure].filter(Boolean).join('；'));
      return;
    }
    await this.#activateBoard(dbName, db);
  }

  async #activateBoard(dbName: string, db: RxDB): Promise<void> {
    if (this.#destroyed) {
      await db.disconnectAll();
      return;
    }
    const previous = this.state.rxdb;
    this.#activeDbName = dbName;
    this.#patch({ rxdb: db, phase: 'board' });
    if (previous === null) return;
    const disconnectFailure = await this.#disconnectFailure(previous, '看板连接释放失败');
    if (disconnectFailure !== null) this.#patch({ error: disconnectFailure });
  }

  // ---------- 恢复 ----------

  async #restoreAndSwitch(archive: Blob): Promise<void> {
    const cleanupFailure = await this.#cleanupInterruptedRestore();
    if (cleanupFailure !== null) throw new Error(cleanupFailure);
    const target = await this.#nextDbName();
    this.#transition({ kind: 'choose_restore' });
    this.#transition({ kind: 'archive_selected', targetDbName: target });
    this.#patch({ phase: 'restoring' });
    this.#write(RESTORE_TARGET_KEY, target);
    this.#write(RESTORING_MARKER_KEY, '1');
    try {
      const adapter = await this.#backupAdapter(this.#options.createRxdb(target));
      await adapter.restore(archive.stream());
      this.#transition({ kind: 'restore_succeeded' });
      this.#write(PENDING_SWITCH_KEY, target);
      this.#runtime.reload();
    } catch (cause) {
      this.#transition({ kind: 'restore_failed', reason: failureMessage(cause) });
      const cleanup = await this.#cleanupInterruptedRestore();
      if (cleanup !== null) throw new Error(`${failureMessage(cause)}；${cleanup}`, { cause });
      throw cause;
    }
  }

  /** 重载后：连接新库并读回，成功才写成活动位置；失败清理并回到旧库。 */
  async #completePendingSwitch(target: string): Promise<void> {
    // 读回窗口内不允许再走启动入口（否则两流程并发写活动位置、另一库成孤儿）
    this.#patch({
      phase: 'restoring',
      restore: {
        ...initialRestoreSnapshot,
        state: 'switching',
        targetDbName: target,
        restoringMarker: true,
        pendingSwitch: true
      }
    });
    const db = this.#options.createRxdb(target);
    try {
      await this.#assertDatabaseExists(target);
      await db.connect(this.#options.adapterName);
      await firstValueFrom(db.entityManager.getRepository(Board).find({ where: matchAll() }));
      this.#write(ACTIVE_DB_KEY, target);
      this.#clear(PENDING_SWITCH_KEY);
      this.#clear(RESTORE_TARGET_KEY);
      this.#clear(RESTORING_MARKER_KEY);
      this.#transition({ kind: 'readback_succeeded' });
    } catch (cause) {
      this.#transition({ kind: 'readback_failed', reason: failureMessage(cause) });
      const disconnectFailure = await this.#disconnectFailure(db, '恢复目标断开失败');
      const cleanupFailure = await this.#cleanupInterruptedRestore();
      // 清理失败时保留待切换记录：下次打开页面再读回一次、失败再清理一次。不会在本页循环——
      // 本次照样回到原看板（或启动页）并报出原因，重试只随页面重开发生
      if (cleanupFailure === null) this.#clear(PENDING_SWITCH_KEY);
      this.#patch({
        error: [`恢复读回失败：${failureMessage(cause)}`, disconnectFailure, cleanupFailure].filter(Boolean).join('；')
      });
      const active = this.#read(ACTIVE_DB_KEY);
      if (active !== null) await this.#openBoard(active);
      else this.#patch({ phase: 'startup' });
      return;
    }
    await this.#activateBoard(target, db);
  }

  /** 清理有记录的恢复目标（不是活动库才清）；失败返回说明并留着记录供下次重试，恢复中标记一律清除。 */
  async #cleanupInterruptedRestore(): Promise<string | null> {
    const target = this.#read(RESTORE_TARGET_KEY);
    const active = this.#read(ACTIVE_DB_KEY);
    try {
      if (target !== null && target !== active) await this.#cleanupTarget(target);
      this.#clear(RESTORE_TARGET_KEY);
      return null;
    } catch (cause) {
      return `恢复目标清理失败：${failureMessage(cause)}，可重新打开页面重试清理`;
    } finally {
      this.#clear(RESTORING_MARKER_KEY);
    }
  }

  /** 实际存在的目标：先清理没做完的恢复，没有残留标记时整库删除（完整的孤儿库）。 */
  async #cleanupTarget(dbName: string): Promise<void> {
    if (!(await this.#runtime.listDatabases()).includes(dbName)) return;
    const adapter = await this.#backupAdapter(this.#options.createRxdb(dbName));
    if (!(await adapter.cleanupIncompleteRestore())) await adapter.dropStorage();
  }

  /** 读回前确认目标存储存在：连接一个不存在的库名会静默建出空库，把丢失的恢复库当成空看板打开。 */
  async #assertDatabaseExists(dbName: string): Promise<void> {
    if (!(await this.#runtime.listDatabases()).includes(dbName)) throw new Error('恢复目标存储已不存在');
  }

  // ---------- 工具 ----------

  /** 不与活动位置、也不与现存库冲突的新库名（只避开活动名会回绕撞上用户旧库）。 */
  async #nextDbName(): Promise<string> {
    return nextRestoreDbName(this.#activeDbName, await this.#runtime.listDatabases());
  }

  /** 删掉本次新建、没能打开的库（连接前就失败的库还没落盘，删除即空操作）；失败返回说明。 */
  async #dropNewDatabase(dbName: string): Promise<string | null> {
    try {
      const adapter = await this.#backupAdapter(this.#options.createRxdb(dbName));
      await adapter.dropStorage();
      return null;
    } catch (cause) {
      return `新看板清理失败：${failureMessage(cause)}`;
    }
  }

  async #backupAdapter(db: RxDB): Promise<BoardBackupAdapter> {
    const adapter: IRxDBAdapter & Partial<BoardBackupAdapter> = await db.getAdapter(this.#options.adapterName);
    if (!isBackupAdapter(adapter)) {
      throw new Error(`适配器 ${this.#options.adapterName} 不支持备份与恢复（需要 backup / restore / dropStorage）`);
    }
    return adapter;
  }

  async #disconnectFailure(db: RxDB, prefix: string): Promise<string | null> {
    try {
      await db.disconnectAll();
      return null;
    } catch (cause) {
      return `${prefix}：${failureMessage(cause)}`;
    }
  }

  #ask(confirm: BoardShellConfirm): Promise<boolean> {
    this.#settleConfirm?.(false);
    return new Promise(settle => {
      this.#settleConfirm = settle;
      this.#patch({ confirm });
    });
  }

  #showFailure(cause: unknown): void {
    this.#patch({ error: failureMessage(cause), phase: this.state.rxdb !== null ? 'board' : 'startup' });
  }

  #transition(input: RestoreInput): void {
    this.#patch({ restore: restoreStateMachine(this.state.restore, input) });
  }

  #patch(patch: Partial<BoardShellState>): void {
    if (this.#destroyed) return;
    this.#state$.next({ ...this.#state$.value, ...patch });
  }

  #read(key: string): string | null {
    return this.#runtime.storage.get(key);
  }

  #write(key: string, value: string): void {
    this.#runtime.storage.set(key, value);
  }

  #clear(key: string): void {
    this.#runtime.storage.remove(key);
  }
}
