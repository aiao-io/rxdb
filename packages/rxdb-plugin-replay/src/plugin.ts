import { RxDBPluginBase, type IRxDBPlugin, type Plugin, type RxDB } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { BehaviorSubject, defer, type Observable } from 'rxjs';
import { RxDBReplayError } from './errors.js';
import { ReplayRuntime } from './manager.js';
import { resolveReplayOptions, type ResolvedReplayOptions, type RxDBReplayOptions } from './options.js';
import type { ReplayManager, ReplayState } from './types.js';

const IDLE: ReplayState = { kind: 'idle' };

const notInstalled = (): RxDBReplayError =>
  new RxDBReplayError(
    'not_installed',
    'rxdb.replay is not installed — await db.connect() first (or again, after a disconnect)'
  );

/**
 * `@aiao/rxdb-plugin-replay` 主类：每个连接纪元建一个 {@link ReplayRuntime}，纪元释放时停录制并销毁录制库。
 *
 * @remarks
 * 使用者面对的是 `rxdb.replay`（{@link ReplayManager}），它在 `use()` 那一刻挂上，跨纪元不变；
 * 纪元之间成员一律 reject `not_installed`——「插件没装」与「还没有会话」是两件事，不能都回一个空数组。
 *
 * @public
 */
export class RxDBPluginReplay extends RxDBPluginBase implements IRxDBPlugin {
  #state = new BehaviorSubject<ReplayState>(IDLE);
  #runtime: ReplayRuntime | null = null;
  readonly name = 'replay';
  /** 只为与连接纪元对齐：插件从不读写被录的应用库。 */
  readonly inject = ['adapter:local'] as const;
  readonly lifecycle = 'scoped' as const;
  /** 补齐默认值、校验过的选项。 */
  readonly options: ResolvedReplayOptions;
  /** `rxdb.replay` 门面。 */
  readonly manager: ReplayManager;

  /**
   * @throws `TypeError` / `RangeError`：选项非法（见 {@link resolveReplayOptions}），此时插件不会被登记
   */
  constructor(rxdb: RxDB, options?: RxDBReplayOptions) {
    const resolved = resolveReplayOptions(options);
    super(rxdb);
    this.options = resolved;
    this.manager = this.#createManager();
  }

  install(scope: LifecycleScope): void {
    const runtime = new ReplayRuntime({ rxdb: this.rxdb, options: this.options, state: this.#state });
    scope.acquire(() => () => this.#release(runtime), 'replay:runtime');
    this.#runtime = runtime;
    runtime.install(scope);
  }

  /** 纪元释放：停录制、销毁录制库，完成本纪元的 `state$` 并为下一个纪元换一个 `idle` 的新流。 */
  async #release(runtime: ReplayRuntime): Promise<void> {
    if (this.#runtime === runtime) this.#runtime = null;
    try {
      await runtime.release();
    } finally {
      const state = this.#state;
      this.#state = new BehaviorSubject<ReplayState>(IDLE);
      state.complete();
    }
  }

  #require(): ReplayRuntime {
    if (this.#runtime === null) throw notInstalled();
    return this.#runtime;
  }

  #createManager(): ReplayManager {
    const call =
      <Args extends unknown[], Result>(run: (runtime: ReplayRuntime, ...args: Args) => Promise<Result>) =>
      async (...args: Args): Promise<Result> =>
        run(this.#require(), ...args);
    const state$: Observable<ReplayState> = defer(() => this.#state);
    return Object.freeze({
      state$,
      start: call(runtime => runtime.start()),
      stop: call(runtime => runtime.stop()),
      listSessions: call(runtime => runtime.listSessions()),
      readEvents: call((runtime, sessionId: string, range?: Parameters<ReplayManager['readEvents']>[1]) =>
        runtime.readEvents(sessionId, range)
      ),
      listCommitMarkers: call((runtime, sessionId: string) => runtime.listCommitMarkers(sessionId)),
      exportSession: call((runtime, sessionId: string) => runtime.exportSession(sessionId)),
      deleteSession: call((runtime, sessionId: string) => runtime.deleteSession(sessionId)),
      usage: call(runtime => runtime.usage()),
      restoreToCommit: call((runtime, commitId: string) => runtime.restoreToCommit(commitId))
    });
  }
}

/**
 * 录制回放插件工厂：`rxdb.use(rxDBPluginReplay, { createRecordingDb })`。
 *
 * @remarks
 * 同一个库重复 `use()` 返回已装的那个实例（不比较选项）。选项非法时同步抛，插件不登记、`rxdb.replay` 不挂。
 *
 * @public
 */
export const rxDBPluginReplay: Plugin<RxDBReplayOptions> = (db, options) => {
  // 问宿主的插件索引，不问 `db.replay`：门面是给使用者的，拿它当探测口会在改名时装出第二个实例
  const [installed] = db.getPlugins('replay');
  if (installed !== undefined) {
    if (installed instanceof RxDBPluginReplay) return installed;
    throw new Error('[rxdb-plugin-replay] a different plugin is already installed under the name "replay"');
  }
  const plugin = new RxDBPluginReplay(db, options);
  Object.defineProperty(db, 'replay', {
    value: plugin.manager,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return plugin;
};

declare module '@aiao/rxdb' {
  interface RxDB {
    /**
     * 录制回放入口；由 `rxdb.use(rxDBPluginReplay, …)` 挂上。
     *
     * @remarks
     * 不标可选：没 `use()` 的库上读它是 `undefined`，与其他插件门面同一约定。
     */
    readonly replay: ReplayManager;
  }
}
