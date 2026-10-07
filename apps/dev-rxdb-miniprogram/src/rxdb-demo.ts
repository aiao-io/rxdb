import type { EntityType, RxDB } from '@aiao/rxdb';
import type { RxDBAdapterWaSqliteMiniProgram } from '@aiao/rxdb-adapter-miniprogram';
import { defineBenchmarkEntities, RxdbBenchmarkWorkload } from './benchmark/rxdb-workload';
import { runBenchmarkSuites, type BenchmarkResult, type BenchmarkSuiteInfo } from './benchmark/scenarios';
import { formatBenchmarkValue } from './benchmark/stats';
import { logStep } from './debug-log';
import { firstValue } from './first-value';
import type { MiniProgramRuntimeReferences, RuntimeCapability } from './runtime-preflight';

type RxdbModule = typeof import('@aiao/rxdb');

type CheckStatus = 'passed' | 'pending';

export interface DemoCheck {
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface DemoOpenResult {
  readonly demo: MiniProgramRxdbDemo;
  readonly capabilities: readonly RuntimeCapability[];
  readonly sqliteVersion: string;
  readonly launchPersistence: DemoCheck;
}

export interface DemoVerificationResult {
  readonly crud: DemoCheck;
  readonly reconnect: DemoCheck;
}

/** 性能测试的进度回调。 */
export interface BenchmarkListener {
  readonly onSuiteStart?: (suite: BenchmarkSuiteInfo) => void;
  readonly onResult?: (suiteId: string, result: BenchmarkResult) => void;
}

const EMPTY_RULE_GROUP = { combinator: 'and' as const, rules: [] };
const LAUNCH_PROBE_KEY = 'launch-persistence';

/**
 * 上一个页面实例，若它的 `dispose()` 还没被调用。
 *
 * `useUnload` 只能 fire-and-forget（Taro 生命周期不接受返回 Promise），而 `reLaunch`
 * 之类的跳转不保证旧页面的 `onUnload` 一定赶在新页面的 `onLoad` 之前跑完。
 */
let activeDemo: MiniProgramRxdbDemo | undefined;

/** 正在进行中的 `dispose()`；成功与否都算「这一轮已经收场」。 */
let pendingDispose: Promise<void> = Promise.resolve();

/**
 * 等上一个页面实例彻底放开数据库，再让本次引导去建连接。
 *
 * 不等的话，「退出页面 → 立刻重进」会让两个实例同时握住同一个库，撞上
 * `wechat-file-vfs.ts` 里模块级的 `ACTIVE_DATABASES` 守卫抛「不支持同一数据库的并发连接」。
 * 两种时序都要兜：`onUnload` 已经跑了但 `disconnectAll()` 还在飞（等 `pendingDispose`），
 * 以及 `onUnload` 压根还没跑（主动收掉 `activeDemo`）。
 */
async function releaseActiveDemo(): Promise<void> {
  await pendingDispose;
  await activeDemo?.dispose();
}

function defineEntities(rxdb: RxdbModule) {
  class TodoModel extends rxdb.EntityBase {
    title!: string;
    completed!: boolean;
  }

  class RuntimeProbeModel extends rxdb.EntityBase {
    key!: string;
    value!: string;
  }

  const Todo = rxdb.Entity({
    name: 'MiniProgramTodo',
    tableName: 'todo',
    namespace: 'miniprogram',
    log: false,
    properties: [
      { name: 'title', type: rxdb.PropertyType.string, required: true },
      { name: 'completed', type: rxdb.PropertyType.boolean, default: false }
    ]
  })(TodoModel);

  const RuntimeProbe = rxdb.Entity({
    name: 'MiniProgramRuntimeProbe',
    tableName: 'runtime_probe',
    namespace: 'miniprogram',
    log: false,
    properties: [
      { name: 'key', type: rxdb.PropertyType.string, required: true, unique: true },
      { name: 'value', type: rxdb.PropertyType.string, required: true }
    ]
  })(RuntimeProbeModel);

  // 性能测试的表与演示 Todo 分开，跑测不动演示数据；已装的库会在 connect 时补建缺失的表
  return { Todo, RuntimeProbe, ...defineBenchmarkEntities(rxdb) };
}

type DemoEntities = ReturnType<typeof defineEntities>;

export class MiniProgramRxdbDemo {
  private readonly rxdb: RxDB;
  private readonly entities: DemoEntities;
  private readonly adapterName: string;

  /** 在飞的重连验证；它中途会 disconnect 再 connect，`dispose()` 必须等它收场。 */
  private pendingReconnect: Promise<unknown> = Promise.resolve();

  /** 在飞的性能测试；`dispose()` 置位后它在下一个采样点停下，断开前必须等它收场。 */
  private pendingBenchmark: Promise<unknown> = Promise.resolve();

  /** `dispose()` 已经开始。 */
  private disposed = false;

  constructor(rxdb: RxDB, entities: DemoEntities, adapterName: string) {
    this.rxdb = rxdb;
    this.entities = entities;
    this.adapterName = adapterName;
  }

  async listTodos(): Promise<TodoItem[]> {
    const todos = await this.list(this.entities.Todo);
    return todos.map(todo => ({
      id: todo.id,
      title: todo.title,
      completed: todo.completed
    }));
  }

  async addTodo(title: string): Promise<TodoItem[]> {
    const todo = new this.entities.Todo();
    todo.title = title;
    todo.completed = false;
    await todo.save();
    return this.listTodos();
  }

  async toggleTodo(id: string): Promise<TodoItem[]> {
    const todo = await this.findTodo(id);
    if (!todo) throw new Error('Todo 不存在或已被删除');
    todo.completed = !todo.completed;
    await todo.save();
    return this.listTodos();
  }

  async removeTodo(id: string): Promise<TodoItem[]> {
    const todo = await this.findTodo(id);
    if (!todo) throw new Error('Todo 不存在或已被删除');
    await todo.remove();
    return this.listTodos();
  }

  /**
   * 清空演示数据：Todo 与运行时探针一起删掉。
   *
   * 探针必须一并删除——「跨启动持久化」只在探针存在时判「通过」，留着它这条检查就永远为真，
   * 验不出下一次启动到底有没有真的从 SQLite 里读回来。
   *
   * 走 SQLite 的 DELETE 而不是删掉落盘目录：目录是连接活着时由 VFS 缓冲着的，
   * 在这个时候删它，连接关闭时的脏页回写会把整个库原样刷回来，看上去就像清库没生效。
   */
  async resetDemoData(): Promise<TodoItem[]> {
    for (const todo of await this.list(this.entities.Todo)) await todo.remove();
    for (const probe of await this.list(this.entities.RuntimeProbe)) await probe.remove();
    return this.listTodos();
  }

  async verifyReconnect(): Promise<DemoVerificationResult> {
    if (this.disposed) throw new Error('演示实例已释放，无法再验证断开重连');
    const running = this.runReconnectVerification();
    // 失败原因由本次调用抛出；`dispose()` 只需要知道这一轮已经收场，不该被它一起拖红
    this.pendingReconnect = running.catch(() => undefined);
    return running;
  }

  /**
   * 跑一遍性能测试（吞吐量 / 延迟分布 / 扩展性 / 并发），每条结果同时打到控制台，方便从开发者工具复制。
   *
   * 数据写在独立的 `benchmark_todo` 表，开始前和每组结束时清空。
   *
   * @param listener - 进度回调
   * @throws `BenchmarkCancelledError` 跑的过程中页面卸载
   */
  async runBenchmark(listener: BenchmarkListener = {}): Promise<void> {
    if (this.disposed) throw new Error('演示实例已释放，无法再运行性能测试');
    const running = this.runBenchmarkSuites(listener);
    // 失败原因由本次调用抛出；`dispose()` 只需要知道这一轮已经收场，不该被它一起拖红
    this.pendingBenchmark = running.catch(() => undefined);
    return running;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (activeDemo === this) activeDemo = undefined;
    // `closing` 必须在这里同步建出来：`pendingDispose` 要在本次调用交还控制权之前就指向完整的
    // 拆卸链，否则 `releaseActiveDemo()` 会看到一个已经作废的旧值，直接放行下一次引导。
    const closing = this.closeAfterPendingWork();
    // 失败原因由本次调用抛出；下一次引导只需要知道这一轮已经收场，不该被它一起拖红
    pendingDispose = closing.catch(() => undefined);
    await closing;
  }

  async checkLaunchPersistence(): Promise<DemoCheck> {
    const existing = await this.findProbe(LAUNCH_PROBE_KEY);
    if (existing) {
      return { status: 'passed', detail: '已读到上次启动写入的持久化探针' };
    }

    const probe = new this.entities.RuntimeProbe();
    probe.key = LAUNCH_PROBE_KEY;
    probe.value = new Date().toISOString();
    await probe.save();
    return { status: 'pending', detail: '已写入探针；结束并重新启动小程序后验证' };
  }

  private async runBenchmarkSuites(listener: BenchmarkListener): Promise<void> {
    logStep('[性能] 开始');
    await runBenchmarkSuites(new RxdbBenchmarkWorkload(this.rxdb, this.entities), {
      now: () => globalThis.performance.now(),
      isCancelled: () => this.disposed,
      onSuiteStart: suite => {
        logStep(`[性能] ${suite.title}`);
        listener.onSuiteStart?.(suite);
      },
      onResult: (suiteId, result) => {
        logStep(`[性能] ${suiteId} · ${result.name}: ${formatBenchmarkValue(result)} | ${result.detail}`);
        listener.onResult?.(suiteId, result);
      }
    });
    logStep('[性能] 完成');
  }

  private async runReconnectVerification(): Promise<DemoVerificationResult> {
    const key = `session-${Date.now()}`;
    const probe = new this.entities.RuntimeProbe();
    probe.key = key;
    probe.value = 'created';
    await probe.save();

    const connectedAdapter = await this.rxdb.connect('wa-sqlite-miniprogram');
    if ((await this.readProbeValue(connectedAdapter, key)) !== 'created') {
      throw new Error('CRUD 自检未从 SQLite 读回新建记录');
    }
    const created = await this.findProbe(key);
    if (!created) throw new Error('CRUD 自检未读回新建记录');
    created.value = 'updated';
    await created.save();
    if ((await this.readProbeValue(connectedAdapter, key)) !== 'updated') {
      throw new Error('CRUD 自检未从 SQLite 读回更新记录');
    }

    await this.rxdb.disconnect(this.adapterName);
    const reopenedAdapter = await this.rxdb.connect('wa-sqlite-miniprogram');

    if ((await this.readProbeValue(reopenedAdapter, key)) !== 'updated') {
      throw new Error('断开重连后未从 SQLite 读到已更新记录');
    }
    const reopened = await this.findProbe(key);
    if (!reopened) throw new Error('断开重连后 RxDB 未读到探针记录');
    await reopened.remove();

    if ((await this.readProbeValue(reopenedAdapter, key)) !== undefined) {
      throw new Error('CRUD 自检未从 SQLite 删除探针记录');
    }
    return {
      crud: { status: 'passed', detail: 'Create / Read / Update / Delete 已通过' },
      reconnect: { status: 'passed', detail: '断开重连后已读回已更新记录' }
    };
  }

  /**
   * 先等在飞的重连验证与性能测试结束，再断开。
   *
   * 反过来的话，`verifyReconnect()` 中途那次 `connect()` 会排在 `disconnectAll()` 之后醒来，
   * 把这个实例重新登记进 `wechat-file-vfs.ts` 的 `ACTIVE_DATABASES`，
   * 下一个页面引导时就会撞上「不支持同一数据库的并发连接」。性能测试则是还在往一个已断开的库里写。
   */
  private async closeAfterPendingWork(): Promise<void> {
    await this.pendingReconnect;
    await this.pendingBenchmark;
    await this.rxdb.disconnectAll();
  }

  private async findTodo(id: string) {
    const todos = await this.list(this.entities.Todo);
    return todos.find(todo => todo.id === id);
  }

  private async findProbe(key: string) {
    const probes = await this.list(this.entities.RuntimeProbe);
    return probes.find(probe => probe.key === key);
  }

  private async list<T extends EntityType>(Entity: T): Promise<InstanceType<T>[]> {
    const repository = this.rxdb.entityManager.getRepository(Entity);
    return firstValue(repository.findAll({ where: EMPTY_RULE_GROUP }));
  }

  private async readProbeValue(adapter: RxDBAdapterWaSqliteMiniProgram, key: string): Promise<string | undefined> {
    const result = await adapter.query('SELECT "value" FROM "miniprogram$runtime_probe" WHERE "key" = ? LIMIT 1', [
      key
    ]);
    const value = result.results[0]?.rows[0]?.[0];
    return typeof value === 'string' ? value : undefined;
  }
}

export async function openMiniProgramRxdbDemo(runtime: MiniProgramRuntimeReferences): Promise<DemoOpenResult> {
  logStep('释放上一个 demo');
  await releaseActiveDemo();
  logStep('引导运行时（补 TextEncoder / TextDecoder / queueMicrotask 等）');
  const runtimePackage = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  await runtimePackage.prepareMiniProgramHostRuntime(runtime.host);

  logStep('加载 RxDB 与 adapter');
  const [rxdb, adapterPackage] = await Promise.all([import('@aiao/rxdb'), import('@aiao/rxdb-adapter-miniprogram')]);
  // glue 与 wasm 都来自 `@subframe7536/sqlite-wasm`（编入 FTS5），adapter 负责定位 glue，
  // wasm 由 `@aiao/rxdb-taro` 放到产物根的 `wa-sqlite/`，三个平台的宿主都指向它（支付宝另有 base64 副本）。
  logStep('加载 wa-sqlite glue');
  const moduleFactory = await adapterPackage.loadSubframeModuleFactory();
  logStep('检测运行时能力');
  const capabilities = adapterPackage.checkMiniProgramRuntimeCapabilities({
    moduleFactory,
    host: runtime.host,
    wasmRuntime: runtime.wasmRuntime
  });
  const missing = capabilities.filter(capability => !capability.available);
  if (missing.length > 0) {
    throw new Error(
      `${runtime.host.displayName}运行时缺少 RxDB 必需能力: ${missing.map(capability => capability.name).join(', ')}`
    );
  }

  logStep('创建 RxDB 实例');
  const entities = defineEntities(rxdb);
  const database = new rxdb.RxDB({
    dbName: 'dev-rxdb-miniprogram',
    context: { userId: 'mini-program-user' },
    entities: [entities.Todo, entities.RuntimeProbe, entities.BenchmarkTodo],
    multiInstance: false,
    sync: {
      local: { adapter: adapterPackage.ADAPTER_NAME },
      type: rxdb.SyncType.None
    }
  });
  database.adapter(
    adapterPackage.ADAPTER_NAME,
    currentDatabase =>
      new adapterPackage.RxDBAdapterWaSqliteMiniProgram(currentDatabase, {
        moduleFactory,
        host: runtime.host,
        wasmRuntime: runtime.wasmRuntime
      })
  );

  logStep('连接数据库');
  const adapter = await database.connect(adapterPackage.ADAPTER_NAME);
  logStep('读取 SQLite 版本与跨启动持久化记录');
  const demo = new MiniProgramRxdbDemo(database, entities, adapterPackage.ADAPTER_NAME);
  activeDemo = demo;
  return {
    demo,
    capabilities,
    sqliteVersion: await adapter.version(),
    launchPersistence: await demo.checkLaunchPersistence()
  };
}
