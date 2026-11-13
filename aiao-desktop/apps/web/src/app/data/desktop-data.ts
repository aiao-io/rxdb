import { EntityType, IRepository, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Service, inject, signal } from '@angular/core';

import { DESKTOP_ADAPTER, FILES_ROOT, schemaGuardOf } from './desktop-database';
import { DESKTOP_ENTITIES } from './entities';
import { DesktopSchemaStaleError } from './schema-guard';
import { adapterInspector, probeSchema } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION, SCHEMA_RECORD_KEY, SchemaPlan, planSchema, runUpgrade } from './schema-version';
import { DATA_SEEDS, DataSeed } from './seeds';
import { SystemPreference } from './system-preference.entity';

export type DataState = 'connecting' | 'ready' | 'failed';

/**
 * 本地数据打不开或不能写的原因（ADESK-US-106）。界面据此给出明确的说明与恢复建议：
 *
 * - `too-new`：库被比本构建更新的版本升级过（降级保护）。数据没问题，换回新构建或刷新到新版本即可；
 * - `stale`：本页面打开期间，另一个标签页把库升级了。刷新页面；
 * - `corrupt`：版本记录无法解析，或库的版本与本构建一致但缺少应有的表或列。不静默修补，需要用户决定；
 * - `incompatible`：库的版本没有迁移路径升到当前构建；
 * - `unavailable`：其余打不开的情况（存储不可用、库文件损坏等）。
 */
export type DataProblem =
  | { readonly kind: 'too-new'; readonly found: number; readonly current: number }
  | { readonly kind: 'stale'; readonly found: number; readonly current: number }
  | { readonly kind: 'corrupt'; readonly reason: string; readonly missing: readonly string[] }
  | { readonly kind: 'incompatible'; readonly from: number }
  | { readonly kind: 'unavailable'; readonly message: string };

/** 启动期判定库不能由本构建打开：带着原因，桌面据此显示阻断界面，不连接也不写库。 */
export class DesktopDataProblemError extends Error {
  constructor(readonly problem: DataProblem) {
    super(`桌面的本地数据不可用：${problem.kind}`);
    this.name = 'DesktopDataProblemError';
  }
}

/** 只取某个键的那一行。 */
export const keyIs = (key: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'key' as const, operator: '=' as const, value: key }]
});

/** 种子标记的键。 */
export const seedMarkerKey = (domain: string): string => `seed:${domain}`;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 判定结果里不能由本构建打开的几种，转成界面用的原因。 */
function problemOf(plan: SchemaPlan): DataProblem | null {
  switch (plan.kind) {
    case 'too-new':
      return { kind: 'too-new', found: plan.found, current: DESKTOP_SCHEMA_VERSION };
    case 'corrupt':
      return { kind: 'corrupt', reason: plan.reason, missing: plan.missing };
    case 'incompatible':
      return { kind: 'incompatible', from: plan.from };
    default:
      return null;
  }
}

/**
 * 桌面的本地数据：先只读探测库的 schema（降级保护与损坏检查，此时不写库），再连上 SQLite、准备好 storage 插件的
 * 文件存储、升级并写入版本记录，最后把各数据域的初始数据写进去。
 * 其余服务经它拿仓储、开事务与创建实体，统一等到库就绪之后。
 */
@Service({ autoProvided: false })
export class DesktopData {
  private readonly rxdb = inject(RxDB);
  private readonly stateValue = signal<DataState>('connecting');
  private readonly errorValue = signal<string | null>(null);
  private readonly problemValue = signal<DataProblem | null>(null);

  readonly state = this.stateValue.asReadonly();
  readonly error = this.errorValue.asReadonly();
  /** 库不能由本页面使用的原因；`null` 表示没有问题。 */
  readonly problem = this.problemValue.asReadonly();
  /** 库可用时完成；连不上或初始数据写入失败时拒绝，`state()` 变为 `failed`。 */
  readonly ready: Promise<RxDB>;

  get database(): RxDB {
    return this.rxdb;
  }

  constructor() {
    this.ready = this.start();
    this.ready.then(
      () => this.stateValue.set('ready'),
      (error: unknown) => {
        this.errorValue.set(describe(error));
        this.problemValue.set(error instanceof DesktopDataProblemError ? error.problem : this.unavailable(error));
        this.stateValue.set('failed');
      }
    );
    schemaGuardOf(this.rxdb).stale$.subscribe(found => {
      if (found !== null) this.problemValue.set({ kind: 'stale', found, current: DESKTOP_SCHEMA_VERSION });
    });
  }

  /**
   * 库能不能用：后台读数据的服务先问一句，库起不来时（原因见 {@link problem}）安静地不去读，
   * 免得每个服务各抛一次同样的拒绝。写数据与界面主动发起的读仍直接 `await` 仓储，失败照常抛给调用方。
   */
  available(): Promise<boolean> {
    return this.ready.then(
      () => true,
      () => false
    );
  }

  async repository<T extends EntityType>(type: T): Promise<IRepository<T>> {
    await this.ready;
    return (await this.rxdb.connect(DESKTOP_ADAPTER)).getRepository(type);
  }

  /** 在一个事务里读写；回调里只能用 `executor.getRepository(…)`，不能等 `entity.save()`。 */
  async transaction<R>(task: (executor: TransactionExecutor) => Promise<R>): Promise<R> {
    await this.ready;
    return (await this.rxdb.connect(DESKTOP_ADAPTER)).transaction(task);
  }

  instantiate<T extends EntityType>(type: T, data: Partial<InstanceType<T>>): InstanceType<T> {
    return this.rxdb.entityManager.instantiate(type, data);
  }

  /**
   * 抹掉本地数据并重新加载：断开库、删掉库文件与文件体，下次打开是一份全新的桌面。
   * 这是不能打开的库（损坏、没有迁移路径）的恢复入口，由用户在阻断界面里明确选择，不会自动发生。
   */
  async eraseLocalData(): Promise<void> {
    const adapter = await this.sqliteAdapter();
    try {
      await adapter.disconnect();
    } finally {
      await adapter.dropStorage();
      await removeDirectory(FILES_ROOT);
    }
  }

  private async sqliteAdapter(): Promise<RxDBAdapterSqlite> {
    const adapter = await this.rxdb.getAdapter(DESKTOP_ADAPTER);
    if (!(adapter instanceof RxDBAdapterSqlite)) throw new Error('桌面的本地适配器不是 sqlite-wasm');
    return adapter;
  }

  private unavailable(error: unknown): DataProblem {
    return error instanceof DesktopSchemaStaleError ?
        { kind: 'stale', found: error.found, current: error.current }
      : { kind: 'unavailable', message: describe(error) };
  }

  private async start(): Promise<RxDB> {
    const adapter = await this.sqliteAdapter();
    await adapter.connect();
    const inspector = adapterInspector(adapter);
    const plan = planSchema(await probeSchema(inspector, DESKTOP_ENTITIES));
    const problem = problemOf(plan);
    if (problem) throw new DesktopDataProblemError(problem);
    await this.rxdb.connect(DESKTOP_ADAPTER);
    await this.rxdb.storage.init();
    await this.upgrade(plan);
    for (const seed of DATA_SEEDS) await this.seed(seed);
    schemaGuardOf(this.rxdb).enable(inspector);
    return this.rxdb;
  }

  /**
   * 全新的库与需要升级的库：在**一个事务**里跑迁移步骤并写入版本记录，全有或全无——升级中途被打断，
   * 库要么还是升级前的状态（版本记录没变，下次重来），要么已是升级后的完整状态。
   * 新增的表由 `RxDB.connect()` 补建，种子按域另有标记，所以重复执行不会重复写。
   */
  private async upgrade(plan: SchemaPlan): Promise<void> {
    if (plan.kind !== 'fresh' && plan.kind !== 'upgrade') return;
    const from = plan.kind === 'upgrade' ? plan.from : 0;
    const adapter = await this.rxdb.connect(DESKTOP_ADAPTER);
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(SystemPreference);
      await runUpgrade(from, {
        execute: (sql, bindings) => executor.query(sql, bindings),
        writeRecord: async record => {
          const existing = (await repository.find({ where: keyIs(SCHEMA_RECORD_KEY), limit: 1 }))[0];
          if (existing) await repository.update(existing, { value: record });
          else
            await repository.create(
              this.rxdb.entityManager.instantiate(SystemPreference, { key: SCHEMA_RECORD_KEY, value: record })
            );
        }
      });
    });
  }

  /** 没有种子标记时，在一个事务里写入初始数据和标记。 */
  private async seed(seed: DataSeed): Promise<void> {
    const adapter = await this.rxdb.connect(DESKTOP_ADAPTER);
    const key = seedMarkerKey(seed.domain);
    const markers = await adapter.getRepository(SystemPreference).find({ where: keyIs(key), limit: 1 });
    if (markers.length) return;
    await adapter.transaction(async executor => {
      await seed.run(executor, this.rxdb);
      const marker = { version: seed.version, seededAt: Date.now() };
      await executor
        .getRepository(SystemPreference)
        .create(this.rxdb.entityManager.instantiate(SystemPreference, { key, value: marker }));
    });
  }
}

/** 删掉 OPFS 根目录下的一个目录（不存在时什么也不做）。 */
async function removeDirectory(name: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(name, { recursive: true }).catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  });
}
