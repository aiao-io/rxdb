/**
 * @fileoverview 测试专用内存版 RxDB 适配器与组装工厂。
 *
 * 组件真实 spec（entity-list / entity-detail）需要一条**真实可写**的本地链路：
 * entityManager → Repository → adapter.getRepository().find / mutations，以及
 * `@aiao/rxdb-plugin-history` 的撤销重做（RxDBChange 变更行 + EntityLocal* 事件 → 活查询）。
 * 真实适配器（wa-sqlite / PGlite）依赖浏览器或 WASM 运行时，不适合 happy-dom 单测；
 * 本模块以内存 Map 实现同一份适配器契约：
 *
 * - 写入（create / update / remove / mutations）与 sqlite-core 同口径地生成
 *   `RxDBChange` 变更行（patch / inversePatch / branchId / transactionId），
 *   并派发 `EntityLocalCreatedEvent` / `EntityLocalUpdatedEvent` /
 *   `EntityLocalRemovedEvent` —— 活查询（QueryManager 增量合并）与历史管理器都吃这一口；
 * - `find` / `count` 直接复用核心包的 `isEntityMatchWhere` / `calculateOrderBy`，
 *   不复制匹配逻辑；
 * - `switchBranch` / `mergeChanges` 支持 undo/redo 回放（SwitchVersionActions）。
 *
 * 这不是「复制组件逻辑的假适配器」：所有查询语义与事件契约都来自 @aiao/rxdb 核心。
 *
 * @internal 仅测试使用，不随库发布。
 */
import {
  calculateOrderBy,
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityMetadata,
  getEntityStatus,
  isEntityMatchWhere,
  parseRxDBChangeKey,
  RxDB,
  RxDBAdapterLocalBase,
  SyncType,
  uuid,
  type EntityInstanceType,
  type EntityStaticType,
  type EntityType,
  type IRepository,
  type IRxDBAdapter,
  type RawQueryResult,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData,
  type RxDBEntityLocalUpdatedEventData,
  type RxDBMutationsMap,
  type SwitchBranchOptions,
  type SwitchVersionActions,
  type TransactionExecutor,
  type TransactionFun
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { generateTestDbName } from '@aiao/rxdb-test';
import { of, type Observable } from 'rxjs';

/** 变更行的物理存储键（namespace:entity:主键）。 */
type RowKey = string;

/** 变更行物理字段（rxdb_change 表列 + branchId 列）。 */
interface ChangeRow extends Record<string, unknown> {
  id: number;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  transactionId: string;
  namespace: string;
  entity: string;
  entityId: string;
  inversePatch: Record<string, unknown> | null;
  patch: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  branchId: string;
  revertChangeId?: number | null;
  revertChangedAt?: Date | null;
  redoInvalidatedAt?: Date | null;
}

/** 待写入的变更行（id 由适配器分配）。 */
interface PendingChangeRow {
  type: ChangeRow['type'];
  namespace: string;
  entity: string;
  entityId: string;
  patch: Record<string, unknown> | null;
  inversePatch: Record<string, unknown> | null;
}

/** 实体数据行的读写副本。 */
type Row = Record<string, unknown>;

/** 查询形状（IRepository 的静态类型参数过于精细，内部按结构子集读取）。 */
interface FindShape {
  where?: { combinator: 'and' | 'or'; rules: unknown[] };
  orderBy?: Array<{ field: string; sort?: 'asc' | 'desc' }>;
  limit?: number;
  offset?: number;
}

const changeRowKey = (id: number | string): RowKey => `rxdb:RxDBChange:${String(id)}`;

/**
 * 读取实体实例的字段快照。
 *
 * @remarks 实体是 Proxy（EntityStatus），`{...entity}` 展开拿到的是当前值（含未保存编辑），
 * 这正是 sqlite 触发器 `NEW.*` 的语义。
 */
const snapshot = (entity: object): Row => {
  const out: Row = {};
  for (const key of Object.keys(entity)) {
    out[key] = (entity as Row)[key];
  }
  return out;
};

/** 摘除主键（变更行 patch/inversePatch 不携带 id）。 */
const withoutId = (row: Row): Record<string, unknown> => {
  const { id: _id, ...rest } = row;
  void _id;
  return rest;
};

/**
 * 内存版仓库：按 RxDB 查询语义在 Map 后备表上求值。
 *
 * @remarks 返回的实体一律经 {@link EntityManager.createEntityRef} 还原为带状态机的实例，
 * 与 sqlite 适配器仓库同口径（查询回来的实例与缓存同身份）。
 * 方法签名与 {@link IRepository} 逐字对齐；实例的内部形态（EntityInstanceType）在
 * 入参/出参边界各做一次窄转。
 */
export class InMemoryRepository<T extends EntityType> implements IRepository<T> {
  get #table(): Map<string, Row> {
    return this.adapter.tableFor(this.EntityType);
  }

  constructor(
    private readonly adapter: InMemoryRxDBAdapter,
    private readonly EntityType: T
  ) {}

  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const opts = options as unknown as FindShape;
    await this.adapter.ready();
    let rows = [...this.#table.values()].filter(row => {
      if (!opts.where) return true;
      return isEntityMatchWhere(row, opts.where as never);
    });
    if (opts.orderBy?.length) {
      rows = calculateOrderBy(rows as never, opts.orderBy as never) as unknown as Row[];
    }
    if (opts.offset) rows = rows.slice(opts.offset);
    if (opts.limit != null) rows = rows.slice(0, opts.limit);
    return rows.map(row => this.#instantiate(row)) as unknown as InstanceType<T>[];
  }

  async count(options: EntityStaticType<T, 'countOptions'>): Promise<number> {
    const opts = options as unknown as FindShape;
    await this.adapter.ready();
    const rows = [...this.#table.values()].filter(row => {
      if (!opts.where) return true;
      return isEntityMatchWhere(row, opts.where as never);
    });
    return rows.length;
  }

  create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const inst = entity as EntityInstanceType<T>;
    const meta = getEntityMetadata(this.EntityType);
    const row = snapshot(inst);
    this.#table.set(String(row['id']), row);
    this.adapter.recordChanges([
      {
        type: 'INSERT',
        namespace: meta.namespace,
        entity: meta.name,
        entityId: String(row['id']),
        patch: withoutId(row),
        inversePatch: null
      }
    ]);
    const status = getEntityStatus(inst);
    status.local = true;
    status.modified = false;
    return Promise.resolve(inst as unknown as InstanceType<T>);
  }

  update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const inst = entity as EntityInstanceType<T>;
    const meta = getEntityMetadata(this.EntityType);
    const id = String(snapshot(inst)['id']);
    const stored = this.#table.get(id);
    const changed: Record<string, unknown> = {};
    const inverse: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const previous = stored?.[key];
      if (stored && JSON.stringify(previous) !== JSON.stringify(value)) {
        inverse[key] = previous;
      }
      changed[key] = value;
      if (stored) stored[key] = value;
    }
    // 与 sqlite-core mutations 同口径：每次 UPDATE 推进 updatedAt。
    // 活查询的指纹是 id@updatedAt —— 不推进则 refresh 重跑后指纹不变、观察者永远收不到新值。
    const updatedAt = new Date();
    changed['updatedAt'] = updatedAt;
    if (stored) stored['updatedAt'] = updatedAt;
    if (Object.keys(changed).length > 0) {
      this.adapter.recordChanges([
        {
          type: 'UPDATE',
          namespace: meta.namespace,
          entity: meta.name,
          entityId: id,
          patch: changed,
          inversePatch: Object.keys(inverse).length ? inverse : null
        }
      ]);
    }
    // 与真实适配器的 updateEntity（applyExternal）同口径：实体基线前移、
    // 未编辑字段同步为库内新值（含 updatedAt）
    getEntityStatus(inst).applyExternal({ ...changed } as never);
    const status = getEntityStatus(inst);
    status.origin = structuredClone(snapshot(inst));
    status.modified = false;
    status.local = true;
    return Promise.resolve(inst as unknown as InstanceType<T>);
  }

  remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const inst = entity as EntityInstanceType<T>;
    const meta = getEntityMetadata(this.EntityType);
    const id = String(snapshot(inst)['id']);
    const stored = this.#table.get(id);
    if (stored) {
      this.#table.delete(id);
      this.adapter.recordChanges([
        {
          type: 'DELETE',
          namespace: meta.namespace,
          entity: meta.name,
          entityId: id,
          patch: null,
          inversePatch: withoutId(stored)
        }
      ]);
    }
    const status = getEntityStatus(inst);
    status.origin = structuredClone(snapshot(inst));
    status.modified = false;
    status.removed = true;
    status.local = false;
    return Promise.resolve(inst as unknown as InstanceType<T>);
  }

  #instantiate(row: Row): EntityInstanceType<T> {
    const data = { ...row };
    return this.adapter.rxdb.entityManager.createEntityRef(this.EntityType, data as never);
  }
}

/**
 * 内存版 RxDB 本地适配器。
 *
 * @remarks 变更行写入与 sqlite-core 触发器同口径：
 * INSERT → patch=整行（不含 id）/inversePatch=null；
 * UPDATE → patch=新值/inversePatch=旧值（仅变更字段）；
 * DELETE → patch=null/inversePatch=整行（不含 id）。
 * 每次写入后先派发业务实体事件、再派发 RxDBChange 元事件（与 handle_rxdb_change 顺序一致）。
 */
export class InMemoryRxDBAdapter extends RxDBAdapterLocalBase implements IRxDBAdapter {
  readonly #tables = new Map<string, Map<string, Row>>();
  readonly #repositories = new Map<EntityType, IRepository<EntityType>>();
  #tablesCreated = false;
  #changeSequence = 0;
  #disconnected = false;
  #bootstrapDoneResolve: (() => void) | null = null;
  readonly #bootstrapDone = new Promise<void>(resolve => {
    this.#bootstrapDoneResolve = resolve;
  });

  name = 'memory';

  /** 测试断言用：库内全部变更行（按 id 升序）。 */
  get changes(): ChangeRow[] {
    return [...(this.#tables.get('rxdb:RxDBChange')?.values() ?? [])].sort(
      (a, b) => Number(a['id']) - Number(b['id'])
    ) as unknown as ChangeRow[];
  }

  /**
   * 引导就绪门：建表完成（completeBootstrap）前挂起仓库查询。
   *
   * @remarks 与 sqlite 家族适配器的就绪门同语义 —— RxDB.connect() 在 init() 里
   * 就放行 localAdapter$，仓库查询此刻已能到达适配器，而建表要等引导链；
   * 没有这道门，HistoryManager 对 RxDBBranch 的 findOne 会在空表上完成首次运行，
   * 任务缓存永远停在空结果（活查询等不来任何事件）。
   */
  ready(): Promise<void> {
    return this.#bootstrapDone;
  }

  tableFor(EntityType: EntityType): Map<string, Row> {
    const meta = getEntityMetadata(EntityType);
    const key = `${meta.namespace}:${meta.name}`;
    let table = this.#tables.get(key);
    if (!table) {
      table = new Map();
      this.#tables.set(key, table);
    }
    return table;
  }

  /** 变更行落库 + 派发实体事件与 RxDBChange 元事件。 */
  recordChanges(changes: PendingChangeRow[]): void {
    if (changes.length === 0) return;
    const branchId = this.#activeBranchId();
    const transactionId = uuid();
    const now = new Date();
    const changeRows: ChangeRow[] = [];
    const created: RxDBEntityLocalCreatedEventData[] = [];
    const updated: RxDBEntityLocalUpdatedEventData[] = [];
    const removed: RxDBEntityLocalRemovedEventData[] = [];
    for (const change of changes) {
      this.#changeSequence += 1;
      const row: ChangeRow = {
        id: this.#changeSequence,
        type: change.type,
        transactionId,
        namespace: change.namespace,
        entity: change.entity,
        entityId: change.entityId,
        patch: change.patch,
        inversePatch: change.inversePatch,
        createdAt: now,
        updatedAt: now,
        branchId,
        remoteId: null,
        localId: null,
        revertChangeId: null,
        revertChangedAt: null,
        redoInvalidatedAt: null
      };
      changeRows.push(row);
      this.#tables.get('rxdb:RxDBChange')?.set(String(row.id), row as unknown as Row);

      if (change.type === 'INSERT') {
        created.push({
          type: 'INSERT',
          namespace: change.namespace,
          entity: change.entity,
          id: change.entityId as never,
          patch: change.patch as never,
          inversePatch: null,
          recordAt: now
        });
      } else if (change.type === 'UPDATE') {
        updated.push({
          type: 'UPDATE',
          namespace: change.namespace,
          entity: change.entity,
          id: change.entityId as never,
          patch: change.patch as never,
          inversePatch: (change.inversePatch ?? {}) as never,
          recordAt: now
        });
      } else {
        removed.push({
          type: 'DELETE',
          namespace: change.namespace,
          entity: change.entity,
          id: change.entityId as never,
          patch: null,
          inversePatch: (change.inversePatch ?? {}) as never,
          recordAt: now
        });
      }
    }

    // 先业务实体事件，再 RxDBChange 元事件 —— 与 handle_rxdb_change 的顺序一致
    if (created.length) this.rxdb.dispatchEvent(new EntityLocalCreatedEvent(created));
    if (updated.length) this.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(updated));
    if (removed.length) this.rxdb.dispatchEvent(new EntityLocalRemovedEvent(removed));
    this.rxdb.dispatchEvent(
      new EntityLocalCreatedEvent(
        changeRows.map(change => ({
          type: change.type,
          namespace: 'rxdb',
          entity: 'RxDBChange',
          id: change.id as never,
          patch: { ...change } as never,
          inversePatch: null,
          recordAt: change.createdAt
        }))
      )
    );
  }

  // ── 生命周期 ─────────────────────────────────────────────────────────

  /**
   * 测试间重置：清空全部业务实体表（保留分支与变更日志），并逐行派发删除事件。
   *
   * @remarks 变更日志只增不减（与 sqlite 语义一致，历史管理器依赖它）；
   * 活跃分支行保留；实体活查询的订阅在测试间随 fixture 销毁而退订，
   * 这里派发的逐行删除事件保证任何残留订阅也能收敛到空集。
   */
  resetData(): void {
    const now = new Date();
    for (const [key, table] of this.#tables) {
      if (key === 'rxdb:RxDBChange' || key === 'rxdb:RxDBBranch') continue;
      const [namespace, entity] = key.split(':');
      for (const row of [...table.values()]) {
        table.delete(String(row['id']));
        this.rxdb.dispatchEvent(
          new EntityLocalRemovedEvent([
            {
              type: 'DELETE',
              namespace,
              entity,
              id: row['id'] as never,
              patch: null,
              inversePatch: withoutId(row) as never,
              recordAt: now
            }
          ])
        );
      }
    }
  }

  async connect(): Promise<IRxDBAdapter> {
    this.#disconnected = false;
    return this as unknown as IRxDBAdapter;
  }

  async disconnect(): Promise<void> {
    this.#disconnected = true;
  }

  async version(): Promise<string> {
    return 'memory-1';
  }

  async isTableExisted(): Promise<boolean> {
    return this.#tablesCreated;
  }

  async createTables(EntityTypes: EntityType[], entities?: EntityInstanceType<EntityType>[]): Promise<boolean> {
    // 引导实例（默认分支、迁移水位线）直接落表
    for (const entity of entities ?? []) {
      const table = this.tableFor(entity.constructor as EntityType);
      const row = snapshot(entity);
      table.set(String(row['id']), row);
    }
    // 建出全部实体表 + 系统表，供 Repository 引导查询命中
    for (const EntityType of EntityTypes) this.tableFor(EntityType);
    this.#tables.set('rxdb:RxDBChange', new Map());
    this.#tablesCreated = true;
    this.completeBootstrap();
    return true;
  }

  /** 关闭引导窗：放行仓库查询（与 sqlite 就绪门同语义）。 */
  override completeBootstrap(): void {
    this.#bootstrapDoneResolve?.();
  }

  // ── 仓库与写入 ───────────────────────────────────────────────────────

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT {
    let repository = this.#repositories.get(EntityType);
    if (!repository) {
      repository = new InMemoryRepository(this, EntityType) as unknown as IRepository<EntityType>;
      this.#repositories.set(EntityType, repository);
    }
    return repository as RT;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    for (const entity of entities) {
      const inst = entity as EntityInstanceType<T>;
      const table = this.tableFor(inst.constructor as T);
      const id = String(snapshot(inst)['id']);
      if (table.has(id)) {
        await this.getRepository<T>(inst.constructor as T).update(entity, snapshot(inst) as never);
      } else {
        await this.getRepository<T>(inst.constructor as T).create(entity);
      }
    }
    return entities;
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    for (const entity of entities) {
      await this.getRepository<T>((entity as EntityInstanceType<T>).constructor as T).remove(entity);
    }
    return entities;
  }

  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    const all = new Set<InstanceType<T>>();

    for (const [EntityType, entities] of options.create) {
      for (const entity of entities) {
        all.add(entity);
        await this.getRepository<T>(EntityType).create(entity);
      }
    }
    for (const [EntityType, entities] of options.update) {
      for (const entity of entities) {
        all.add(entity);
        const patch = getEntityStatus(entity as EntityInstanceType<T>).patch;
        if (patch === null || Object.keys(patch).length === 0) continue;
        await this.getRepository<T>(EntityType).update(entity, patch as never);
      }
    }
    for (const [EntityType, entities] of options.remove) {
      for (const entity of entities) {
        all.add(entity);
        await this.getRepository<T>(EntityType).remove(entity);
      }
    }
    return [...all];
  }

  // ── 事务与回放 ───────────────────────────────────────────────────────

  async transaction<TF extends TransactionFun>(fun: TF, transactionLog?: boolean): Promise<Awaited<ReturnType<TF>>> {
    void transactionLog;
    const executor: TransactionExecutor = {
      id: uuid(),
      state: 'active',
      query: (sql: string, params?: readonly unknown[]): Promise<RawQueryResult> => {
        void sql;
        void params;
        return Promise.resolve({ rowsAffected: 0, rows: [], columns: [] });
      },
      mutations: options => this.mutations(options as RxDBMutationsMap),
      getRepository: EntityType => this.getRepository(EntityType),
      saveMany: entities => this.saveMany(entities),
      removeMany: entities => this.removeMany(entities),
      mergeChanges: (actions, localChanges, disableTriggers) =>
        this.mergeChanges(actions, localChanges, disableTriggers),
      run: fn => fn(executor)
    };
    return fun(executor) as Promise<Awaited<ReturnType<TF>>>;
  }

  async switchBranch(options: SwitchBranchOptions): Promise<void> {
    if (this.#disconnected) throw new Error('Adapter is disconnected');
    if (options.branchId) {
      const branches = this.#tables.get('rxdb:RxDBBranch');
      for (const row of branches?.values() ?? []) {
        row['activated'] = String(row['id']) === options.branchId;
      }
    }
    await this.#applyActions(options.actions);
  }

  async getRxDBChangeSequence(): Promise<number> {
    return this.#changeSequence;
  }

  async mergeChanges(
    actions: SwitchVersionActions,
    localChanges?: Omit<{ id: number }, 'id'>[],
    disableTriggers?: boolean
  ): Promise<void> {
    void disableTriggers;
    if (localChanges?.length) {
      this.recordChanges(
        localChanges.map(change => ({
          type: (change as { type?: ChangeRow['type'] }).type ?? 'UPDATE',
          namespace: (change as { namespace?: string }).namespace ?? '',
          entity: (change as { entity?: string }).entity ?? '',
          entityId: String((change as { entityId?: unknown }).entityId ?? ''),
          patch: (change as { patch?: Record<string, unknown> | null }).patch ?? null,
          inversePatch: (change as { inversePatch?: Record<string, unknown> | null }).inversePatch ?? null
        }))
      );
    }
    await this.#applyActions(actions);
  }

  // ── 同步面（本地测试不跨实例同步，返回空） ───────────────────────────

  getMetadataByIds(entityName: string, ids: string[]): Observable<Map<string, string>> {
    void entityName;
    void ids;
    return of(new Map());
  }

  upsertMany<T>(entityName: string, data: T[]): Observable<void> {
    void entityName;
    void data;
    return of(undefined);
  }

  deleteByIds(entityName: string, ids: string[]): Observable<void> {
    void entityName;
    void ids;
    return of(undefined);
  }

  // ── 私有实现 ─────────────────────────────────────────────────────────

  /** 当前激活分支 id（无分支行时回退 main，覆盖建表前的写入）。 */
  #activeBranchId(): string {
    const branches = this.#tables.get('rxdb:RxDBBranch');
    const active = [...(branches?.values() ?? [])].find(row => row['activated'] === true);
    return String(active?.['id'] ?? 'main');
  }

  /**
   * 按 SwitchVersionActions 键应用回放动作。
   *
   * @remarks 业务实体键由核心的 `getRxDBChangeKey` 生成（实体 id 经身份编码），
   * 必须用核心的 {@link parseRxDBChangeKey} 还原；变更行键由历史插件以原始 id
   * 拼接（`rxdb:RxDBChange:{id}`），单独解析。
   */
  async #applyActions(actions: SwitchVersionActions): Promise<void> {
    const created: RxDBEntityLocalCreatedEventData[] = [];
    const updated: RxDBEntityLocalUpdatedEventData[] = [];
    const removed: RxDBEntityLocalRemovedEventData[] = [];
    const now = new Date();

    const parseKey = (key: string): readonly [string, string, unknown] => {
      const changePrefix = 'rxdb:RxDBChange:';
      if (key.startsWith(changePrefix)) {
        return ['rxdb', 'RxDBChange', key.slice(changePrefix.length)];
      }
      return parseRxDBChangeKey(key);
    };

    for (const [key] of actions.deletes) {
      const [namespace, entity, parsedId] = parseKey(key);
      const id = String(parsedId);
      const table = this.#tables.get(`${namespace}:${entity}`);
      const row = table?.get(id);
      if (!table || !row) continue;
      table.delete(id);
      removed.push({
        type: 'DELETE',
        namespace,
        entity,
        id: id as never,
        patch: null,
        inversePatch: withoutId(row) as never,
        recordAt: now
      });
    }

    for (const [key, action] of actions.updates) {
      const [namespace, entity, parsedId] = parseKey(key);
      const id = String(parsedId);
      const table = this.#tables.get(`${namespace}:${entity}`);
      const row = table?.get(id);
      if (!table || !row) continue;
      Object.assign(row, action.patch ?? {});
      updated.push({
        type: 'UPDATE',
        namespace,
        entity,
        id: id as never,
        // 变更行（RxDBChange）的更新事件按整行广播，业务实体按 patch 广播
        patch: (entity === 'RxDBChange' ? { ...row } : (action.patch ?? {})) as never,
        inversePatch: (action.inversePatch ?? {}) as never,
        recordAt: now
      });
    }

    for (const [key, action] of actions.inserts) {
      const [namespace, entity, parsedId] = parseKey(key);
      const id = String(parsedId);
      const table = this.#tables.get(`${namespace}:${entity}`);
      const row: Row = { ...(action.patch ?? {}), id };
      table?.set(id, row);
      created.push({
        type: 'INSERT',
        namespace,
        entity,
        id: id as never,
        patch: { ...row } as never,
        inversePatch: null,
        recordAt: now
      });
    }

    if (actions.updateRxDBChangeSequence != null) {
      this.#changeSequence = Math.max(this.#changeSequence, actions.updateRxDBChangeSequence);
    }

    if (created.length) this.rxdb.dispatchEvent(new EntityLocalCreatedEvent(created));
    if (updated.length) this.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(updated));
    if (removed.length) this.rxdb.dispatchEvent(new EntityLocalRemovedEvent(removed));
  }
}

/** 变更行物理键（供 switchBranch 键解析与测试断言复用）。 */
export const changeKeyOf = changeRowKey;

/** 本内存适配器在 RxDB 注册表与 sync.local.adapter 中的统一名字。 */
export const IN_MEMORY_ADAPTER_NAME = 'memory';

/**
 * 组装一个接好内存适配器与历史插件的 RxDB 实例。
 *
 * @param entities - 注册的业务实体
 * @param dbName - 数据库名（默认生成唯一名）
 * @returns RxDB 实例；调用方必须 `await rxdb.connect(IN_MEMORY_ADAPTER_NAME)` 后使用
 *
 * @remarks 每个实例独立持表，测试之间无共享可变状态；
 * 历史插件（undo/redo）为 entity-list 组件的硬依赖，在此一并安装。
 */
export function createInMemoryRxdb(
  entities: EntityType[],
  dbName: string = generateTestDbName('rxdb-model-angular')
): RxDB {
  const rxdb = new RxDB({
    dbName,
    entities,
    sync: { type: SyncType.None, local: { adapter: IN_MEMORY_ADAPTER_NAME } }
  });
  rxdb.adapter(IN_MEMORY_ADAPTER_NAME, db => new InMemoryRxDBAdapter(db));
  rxdb.use(rxDBPluginHistory);
  return rxdb;
}
