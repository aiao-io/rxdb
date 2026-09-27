/**
 * 实例级同步覆盖的三端夹具 —— US-026 AC#12。
 *
 * @remarks
 * Angular / React / Vue 的 `tri-framework-sync-override.spec.ts` 共用这一份：同一个带
 * `QueryCache + local + remote` 声明的实体、同一份 core `syncOverrides` 配置、同一个记录去向的
 * 本地适配器。三端只换「查询入口」和「写入入口」（各自的 `useFind` / `useAction`），
 * 路由、数据与错误语义的断言值全部来自这里，任一端跑偏都会在自己的 spec 里失败。
 *
 * 框架绑定层**不读**任何同步配置：它们只调用 `rxdb.init()` 绑好的实体静态方法。
 * 所以本夹具要证明的是「覆盖对三端透明」——三端不需要、也不允许出现各自的覆盖语义。
 *
 * 适配器只保留 Map 后备表与事件派发，不复制查询语义：`where` 恒为全量，排序交给调用方。
 * 真实存储行为由各适配器包的集成层负责，这里只回答「写去了哪一侧」。
 */

import {
  Entity,
  EntityBase,
  EntityLocalCreatedEvent,
  getEntityMetadata,
  getEntityStatus,
  PropertyType,
  RxDB,
  RxDBAdapterLocalBase,
  SyncType,
  uuid,
  type EntityInstanceType,
  type EntityType,
  type IRepository,
  type IRxDBAdapter,
  type RxDBMutationsMap,
  type SyncOptions,
  type TransactionExecutor,
  type TransactionFun,
  type UUID
} from '@aiao/rxdb';
import { of, type Observable } from 'rxjs';

/** 覆盖后唯一应当被连接的本地适配器名 */
export const SYNC_OVERRIDE_LOCAL_ADAPTER = 'tri-sync-local';

/** 实体装饰器写死的远端适配器名；覆盖生效时永远不应被实例化 */
export const SYNC_OVERRIDE_REMOTE_ADAPTER = 'tri-sync-remote';

/** 实体装饰器上的原始声明：前端视角的 QueryCache */
export const SYNC_OVERRIDE_DECLARED: SyncOptions = {
  type: SyncType.QueryCache,
  local: { adapter: SYNC_OVERRIDE_LOCAL_ADAPTER },
  remote: { adapter: SYNC_OVERRIDE_REMOTE_ADAPTER }
};

/** 实例覆盖：服务端视角的纯本地，整体替换装饰器声明 */
export const SYNC_OVERRIDE_EFFECTIVE: SyncOptions = {
  type: SyncType.None,
  local: { adapter: SYNC_OVERRIDE_LOCAL_ADAPTER }
};

/**
 * 两个库共用的数据库级配置：本地与远端都注册了名字。
 *
 * @remarks
 * 对照组要的是「前端库缺 QueryCache 插件」这条错误；库级不登记 remote 的话，先拦下来的
 * 会是元数据校验的 `missingQueryCacheAdapter`，那就不是覆盖要替掉的那条路径了。
 * 覆盖组用同一份，于是两组唯一的差别就是有没有 `syncOverrides`。
 */
export const SYNC_OVERRIDE_DATABASE_SYNC: SyncOptions = {
  type: SyncType.None,
  local: { adapter: SYNC_OVERRIDE_LOCAL_ADAPTER },
  remote: { adapter: SYNC_OVERRIDE_REMOTE_ADAPTER }
};

/** 连接前种进本地表的标题（按插入顺序） */
export const SYNC_OVERRIDE_SEED_TITLES: readonly string[] = ['种子 A', '种子 B'];

/** 三端经各自写入入口保存的那一条 */
export const SYNC_OVERRIDE_WRITE_TITLE = '三端写入';

/** 没有覆盖时 `connect()` 的拒绝原因须点名的实体 */
export const SYNC_OVERRIDE_CONTROL_ERROR_PATTERN = /TriSyncNote/;

/** 夹具实体的实例形状 */
export interface SyncOverrideNoteLike {
  id: UUID;
  title: string;
  save(): Promise<SyncOverrideNoteLike>;
}

/**
 * 夹具实体类。
 *
 * @remarks
 * 实例参数必须显式写成 {@link SyncOverrideNoteLike}：缺省是 `object`，hooks 推出来的元素类型
 * 会塌成 `object`，三端的类型断言就测不到东西。
 */
export type SyncOverrideNoteType = EntityType<object, SyncOverrideNoteLike> &
  (new (init?: Partial<SyncOverrideNoteLike>) => SyncOverrideNoteLike);

/**
 * 每个数据库一个全新的实体类。
 *
 * @remarks
 * 核心把 `EntityManager` 挂在实体原型上，同一个类注册进第二个 `RxDB` 会直接抛错；
 * 对照组与覆盖组各开一个库，所以不能共用一个类。
 */
export const defineSyncOverrideNote = (): SyncOverrideNoteType => {
  @Entity({
    namespace: 'tri_sync',
    name: 'TriSyncNote',
    properties: [{ name: 'title', type: PropertyType.string, required: true }],
    sync: SYNC_OVERRIDE_DECLARED
  })
  class TriSyncNote extends EntityBase {
    title!: string;
  }
  return TriSyncNote as unknown as SyncOverrideNoteType;
};

type Row = Record<string, unknown>;

/** 实体实例的当前字段快照 */
const snapshot = (entity: object): Row => ({ ...(entity as Row) });

/** 夹具仓储：全量读、按主键写，写入同时记账与派发本地事件 */
class SyncOverrideRepository<T extends EntityType> implements IRepository<T> {
  constructor(
    private readonly adapter: SyncOverrideLocalAdapter,
    private readonly EntityType: T
  ) {}

  async find(): Promise<InstanceType<T>[]> {
    const rows = [...this.adapter.tableFor(this.EntityType).values()];
    return rows.map(
      row => this.adapter.rxdb.entityManager.createEntityRef(this.EntityType, { ...row } as never) as InstanceType<T>
    );
  }

  async count(): Promise<number> {
    return this.adapter.tableFor(this.EntityType).size;
  }

  async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const row = snapshot(entity);
    this.adapter.tableFor(this.EntityType).set(String(row['id']), row);
    this.adapter.recordWrite(this.EntityType, row);
    const status = getEntityStatus(entity as EntityInstanceType<T>);
    status.local = true;
    status.modified = false;
    return entity;
  }

  async update(entity: InstanceType<T>): Promise<InstanceType<T>> {
    return this.create(entity);
  }

  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    this.adapter.tableFor(this.EntityType).delete(String(snapshot(entity)['id']));
    return entity;
  }
}

/** 记录写入去向的本地适配器 */
class SyncOverrideLocalAdapter extends RxDBAdapterLocalBase implements IRxDBAdapter {
  readonly #tables = new Map<EntityType, Map<string, Row>>();
  readonly #repositories = new Map<EntityType, IRepository<EntityType>>();

  name = SYNC_OVERRIDE_LOCAL_ADAPTER;

  /** 经本适配器落库的业务写入（系统表不计），按发生顺序 */
  readonly writes: Row[] = [];

  tableFor(EntityType: EntityType): Map<string, Row> {
    let table = this.#tables.get(EntityType);
    if (!table) {
      table = new Map();
      this.#tables.set(EntityType, table);
    }
    return table;
  }

  /** 记账并派发本地创建事件，活查询靠它增量刷新 */
  recordWrite(EntityType: EntityType, row: Row): void {
    const metadata = getEntityMetadata(EntityType);
    if (metadata.namespace === 'tri_sync') this.writes.push(row);
    this.rxdb.dispatchEvent(
      new EntityLocalCreatedEvent([
        {
          type: 'INSERT',
          namespace: metadata.namespace,
          entity: metadata.name,
          id: row['id'] as never,
          patch: row as never,
          inversePatch: null,
          recordAt: new Date()
        }
      ])
    );
  }

  async connect(): Promise<IRxDBAdapter> {
    return this;
  }

  async disconnect(): Promise<void> {
    this.#tables.clear();
  }

  async version(): Promise<string> {
    return 'tri-sync-1';
  }

  async isTableExisted(EntityType: EntityType): Promise<boolean> {
    return this.#tables.has(EntityType);
  }

  async createTables(EntityTypes: EntityType[], entities: InstanceType<EntityType>[] = []): Promise<boolean> {
    for (const EntityType of EntityTypes) this.tableFor(EntityType);
    for (const entity of entities) {
      const row = snapshot(entity);
      this.tableFor(entity.constructor as EntityType).set(String(row['id']), row);
    }
    return true;
  }

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT {
    let repository = this.#repositories.get(EntityType);
    if (!repository) {
      repository = new SyncOverrideRepository(this, EntityType) as unknown as IRepository<EntityType>;
      this.#repositories.set(EntityType, repository);
    }
    return repository as RT;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    for (const entity of entities) await this.#repositoryOf(entity).create(entity);
    return entities;
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    for (const entity of entities) await this.#repositoryOf(entity).remove(entity);
    return entities;
  }

  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    const written = [...options.create.values(), ...options.update.values()].flatMap(set => [...set]);
    const removed = [...options.remove.values()].flatMap(set => [...set]);
    await this.saveMany(written);
    await this.removeMany(removed);
    return [...written, ...removed];
  }

  async transaction<TF extends TransactionFun>(fun: TF): Promise<Awaited<ReturnType<TF>>> {
    const executor: TransactionExecutor = {
      id: uuid(),
      state: 'active',
      query: async () => ({ rowsAffected: 0, rows: [], columns: [] }),
      tableRef: EntityType => getEntityMetadata(EntityType).tableName,
      mutations: options => this.mutations(options as RxDBMutationsMap),
      getRepository: EntityType => this.getRepository(EntityType),
      saveMany: entities => this.saveMany(entities),
      removeMany: entities => this.removeMany(entities),
      mergeChanges: async () => undefined,
      run: fn => fn(executor)
    };
    return fun(executor) as Promise<Awaited<ReturnType<TF>>>;
  }

  async switchBranch(): Promise<void> {
    return undefined;
  }

  async getRxDBChangeSequence(): Promise<number> {
    return 0;
  }

  async mergeChanges(): Promise<void> {
    return undefined;
  }

  getMetadataByIds(): Observable<Map<string, string>> {
    return of(new Map());
  }

  upsertMany(): Observable<void> {
    return of(undefined);
  }

  deleteByIds(): Observable<void> {
    return of(undefined);
  }

  #repositoryOf<T extends EntityType>(entity: InstanceType<T>): IRepository<T> {
    return this.getRepository((entity as EntityInstanceType<T>).constructor as T);
  }
}

/**
 * 单标签页的 `BroadcastChannel` 替身：不回环投递。
 *
 * @remarks
 * `connect()` 会开跨标签页事件频道，而 happy-dom 不提供 `BroadcastChannel`。三端 spec 都用
 * `vi.stubGlobal('BroadcastChannel', SingleTabBroadcastChannel)` 装同一个，
 * 否则某一端「恰好」拿到 Node 全局的那个，对齐就只是巧合。
 */
export class SingleTabBroadcastChannel {
  readonly #listeners = new Set<(event: MessageEvent) => void>();

  addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  postMessage(): void {
    // 单标签页：没有别的接收方
  }

  close(): void {
    this.#listeners.clear();
  }
}

/** 一套打开的覆盖夹具 */
export interface SyncOverrideHarness {
  readonly rxdb: RxDB;
  readonly Note: SyncOverrideNoteType;
  /** 本地适配器上发生过的业务写入标题，按发生顺序 */
  localWriteTitles(): string[];
  /** 远端适配器工厂被调用的次数；覆盖生效时恒为 0 */
  remoteFactoryCalls(): number;
  /** 断开并清缓存 */
  dispose(): Promise<void>;
}

let dbSequence = 0;

/** 组装一个库；`overridden` 为假时就是没有覆盖的对照组 */
const buildDatabase = (overridden: boolean) => {
  const Note = defineSyncOverrideNote();
  dbSequence += 1;
  const rxdb = new RxDB({
    dbName: `tri_sync_${dbSequence}`,
    entities: [Note],
    sync: SYNC_OVERRIDE_DATABASE_SYNC,
    syncOverrides: overridden ? [{ entity: Note, sync: SYNC_OVERRIDE_EFFECTIVE }] : []
  });
  let local: SyncOverrideLocalAdapter | undefined;
  let remoteCalls = 0;
  rxdb.adapter(SYNC_OVERRIDE_LOCAL_ADAPTER, db => {
    local = new SyncOverrideLocalAdapter(db);
    return local;
  });
  rxdb.adapter(SYNC_OVERRIDE_REMOTE_ADAPTER, db => {
    remoteCalls += 1;
    return new SyncOverrideLocalAdapter(db);
  });
  const connectedLocal = (): SyncOverrideLocalAdapter => {
    if (!local) throw new Error('本地适配器尚未被连接');
    return local;
  };
  return { rxdb, Note, local: connectedLocal, remoteCalls: () => remoteCalls };
};

/**
 * 打开带实例覆盖的库，并经实体自己的 `save()` 种入 {@link SYNC_OVERRIDE_SEED_TITLES}。
 *
 * @returns 已连接的夹具；用完调用 `dispose()`
 */
export const openSyncOverrideDatabase = async (): Promise<SyncOverrideHarness> => {
  const { rxdb, Note, local, remoteCalls } = buildDatabase(true);
  await rxdb.connect(SYNC_OVERRIDE_LOCAL_ADAPTER);
  for (const title of SYNC_OVERRIDE_SEED_TITLES) await new Note({ title }).save();
  return {
    rxdb,
    Note,
    localWriteTitles: () => local().writes.map(row => String(row['title'])),
    remoteFactoryCalls: remoteCalls,
    dispose: async () => {
      await rxdb.disconnectAll();
      rxdb.entityManager.cleanAllCache();
    }
  };
};

/**
 * 对照组：同一个实体、同一份数据库配置，只是没有覆盖。
 *
 * @returns `connect()` 的结果；应以缺 QueryCache 插件为由拒绝
 */
export const connectWithoutSyncOverride = async (): Promise<unknown> => {
  const { rxdb } = buildDatabase(false);
  try {
    return await rxdb.connect(SYNC_OVERRIDE_LOCAL_ADAPTER);
  } finally {
    await rxdb.disconnectAll();
  }
};
