import type { EntityType, RxDB } from '@aiao/rxdb';
import type {
    RxDBAdapterWaSqliteMiniProgram,
    WaSqliteModuleFactory
} from '@aiao/rxdb-adapter-miniprogram';
import type { MiniProgramRuntimeReferences, RuntimeCapability } from './runtime-preflight';

type RxdbModule = typeof import('@aiao/rxdb');
type WaSqliteFactoryModule = typeof import('@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs');

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

interface SubscriptionLike {
  unsubscribe(): void;
}

interface ObservableLike<T> {
  subscribe(observer: {
    next(value: T): void;
    error(reason: unknown): void;
    complete(): void;
  }): SubscriptionLike;
}

const EMPTY_RULE_GROUP = { combinator: 'and' as const, rules: [] };
const LAUNCH_PROBE_KEY = 'launch-persistence';

function firstValue<T>(source: ObservableLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: SubscriptionLike | undefined;
    const unsubscribe = () => Promise.resolve().then(() => subscription?.unsubscribe());

    subscription = source.subscribe({
      next(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        unsubscribe();
      },
      error(reason) {
        if (settled) return;
        settled = true;
        reject(reason);
      },
      complete() {
        if (settled) return;
        settled = true;
        reject(new Error('RxDB 查询没有返回结果'));
      }
    });
  });
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

  return { Todo, RuntimeProbe };
}

type DemoEntities = ReturnType<typeof defineEntities>;

function normalizeModuleFactory(module: WaSqliteFactoryModule): WaSqliteModuleFactory {
  if (typeof module.default !== 'function') throw new Error('wa-sqlite glue 未导出模块工厂');
  return module.default;
}

export class MiniProgramRxdbDemo {
  private readonly rxdb: RxDB;
  private readonly entities: DemoEntities;
  private readonly adapterName: string;

  constructor(
    rxdb: RxDB,
    entities: DemoEntities,
    adapterName: string
  ) {
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

  async verifyReconnect(): Promise<DemoVerificationResult> {
    const key = `session-${Date.now()}`;
    const probe = new this.entities.RuntimeProbe();
    probe.key = key;
    probe.value = 'created';
    await probe.save();

    const connectedAdapter = await this.rxdb.connect('wa-sqlite-miniprogram');
    if (await this.readProbeValue(connectedAdapter, key) !== 'created') {
      throw new Error('CRUD 自检未从 SQLite 读回新建记录');
    }
    const created = await this.findProbe(key);
    if (!created) throw new Error('CRUD 自检未读回新建记录');
    created.value = 'updated';
    await created.save();
    if (await this.readProbeValue(connectedAdapter, key) !== 'updated') {
      throw new Error('CRUD 自检未从 SQLite 读回更新记录');
    }

    await this.rxdb.disconnect(this.adapterName);
    const reopenedAdapter = await this.rxdb.connect('wa-sqlite-miniprogram');

    if (await this.readProbeValue(reopenedAdapter, key) !== 'updated') {
      throw new Error('断开重连后未从 SQLite 读到已更新记录');
    }
    const reopened = await this.findProbe(key);
    if (!reopened) throw new Error('断开重连后 RxDB 未读到探针记录');
    await reopened.remove();

    if (await this.readProbeValue(reopenedAdapter, key) !== undefined) {
      throw new Error('CRUD 自检未从 SQLite 删除探针记录');
    }
    return {
      crud: { status: 'passed', detail: 'Create / Read / Update / Delete 已通过' },
      reconnect: { status: 'passed', detail: '断开重连后已读回已更新记录' }
    };
  }

  async dispose(): Promise<void> {
    await this.rxdb.disconnectAll();
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
    const result = await adapter.query(
      'SELECT "value" FROM "miniprogram$runtime_probe" WHERE "key" = ? LIMIT 1',
      [key]
    );
    const value = result.results[0]?.rows[0]?.[0];
    return typeof value === 'string' ? value : undefined;
  }
}

export async function openMiniProgramRxdbDemo(runtime: MiniProgramRuntimeReferences): Promise<DemoOpenResult> {
  const runtimePackage = await import('@aiao/rxdb-adapter-miniprogram/runtime');
  await runtimePackage.prepareMiniProgramRuntime(runtime.wechat);

  const [rxdb, adapterPackage, glueModule] = await Promise.all([
    import('@aiao/rxdb'),
    import('@aiao/rxdb-adapter-miniprogram'),
    import('@aiao/rxdb-adapter-miniprogram/assets/wa-sqlite.cjs')
  ]);
  const moduleFactory = normalizeModuleFactory(glueModule);
  const capabilities = adapterPackage.checkMiniProgramRuntimeCapabilities({
    moduleFactory,
    wechat: runtime.wechat,
    wasmRuntime: runtime.wasmRuntime
  });
  const missing = capabilities.filter(capability => !capability.available);
  if (missing.length > 0) {
    throw new Error(`微信运行时缺少 RxDB 必需能力: ${missing.map(capability => capability.name).join(', ')}`);
  }

  const entities = defineEntities(rxdb);
  const database = new rxdb.RxDB({
    dbName: 'taro-react-todo',
    context: { userId: 'mini-program-user' },
    entities: [entities.Todo, entities.RuntimeProbe],
    multiInstance: false,
    sync: {
      local: { adapter: adapterPackage.ADAPTER_NAME },
      type: rxdb.SyncType.None
    }
  });
  database.adapter(adapterPackage.ADAPTER_NAME, currentDatabase =>
    new adapterPackage.RxDBAdapterWaSqliteMiniProgram(currentDatabase, {
      moduleFactory,
      wechat: runtime.wechat,
      wasmRuntime: runtime.wasmRuntime,
      wasmPath: adapterPackage.DEFAULT_WASM_PATH
    })
  );

  const adapter = await database.connect(adapterPackage.ADAPTER_NAME);
  const demo = new MiniProgramRxdbDemo(database, entities, adapterPackage.ADAPTER_NAME);
  return {
    demo,
    capabilities,
    sqliteVersion: await adapter.version(),
    launchPersistence: await demo.checkLaunchPersistence()
  };
}
