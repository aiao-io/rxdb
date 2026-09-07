import { nextMicroTask } from '@aiao/utils';
import { firstValueFrom, Observable } from 'rxjs';
import merge_create from '../query/merge_create.js';
import merge_remove from '../query/merge_remove.js';
import merge_update from '../query/merge_update.js';
import { Repository } from '../repository/Repository.js';
import { RepositoryBase } from '../repository/RepositoryBase.js';
import { TreeRepository } from '../repository/TreeRepository.js';
import { IRxDBAdapter, RxDBMutationsMap } from '../rxdb-adapter.js';
import { EntityLocalNewEvent, EntityLocalUpdatedEvent } from '../rxdb-events.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { ENTITY_MANAGER, ENTITY_TYPE, PROXY, STATUS } from '../rxdb.private.js';
import { RxDBError } from '../RxDBError.js';
import { EntityIdentityCache } from './entity-identity-cache.js';
import { EntityStatusOptions } from './entity-status.interface.js';
import { EntityStatus } from './entity-status.js';
import { EntityStaticType, EntityType, EntityUpdateData } from './entity.interface.js';
import {
  getEntityMutations,
  getNeedRemoveEntities,
  getNeedSaveEntities,
  setRuntimeObjectGetter,
  setRuntimeObjectKey,
  setSafeObjectKey,
  setSafeObjectWritableKey
} from './entity.utils.js';
import { formatMetadataViolations, validateEntityMetadataSet } from './metadata-validate.js';
import { collectMutationEntityTypes, isQueryCacheBatch, resolveBatchPrimaryAdapter } from './primary-adapter.js';
import { createEntityProxy } from './proxy.js';
import entity_relation_helper from './relation-helper.js';

/**
 * @fileoverview 实体管理器
 * 提供实体的生命周期管理、缓存、关系处理和仓库访问
 * 作为实体系统的核心组件，协调实体的创建、更新、删除和查询操作
 */

/**
 * 把 {@link RxDBMutationsMap} 的一个桶摊平成实体数组。
 *
 * @remarks
 * 桶是 `Map<EntityType, Set<Entity>>`，逐条走仓储的路径不关心实体属于哪个类型
 * ——类型信息在实体的 `constructor` 上，`EntityManager.create/update/remove` 自己会取。
 */
const flattenMutationEntities = <T extends EntityType>(bucket: Map<T, Set<InstanceType<T>>>): InstanceType<T>[] =>
  [...bucket.values()].flatMap(entities => [...entities]);

/**
 * 实体管理器
 *
 * 负责管理实体的整个生命周期，包括：
 * 1. 实体的创建、更新和删除
 * 2. 实体缓存管理
 * 3. 实体关系处理
 * 4. 实体仓库访问
 * 5. 实体代理和变更跟踪
 *
 * 实体管理器是连接实体、仓库和数据库的桥梁，
 * 它确保实体状态的一致性，并处理实体间的关系。
 */
export class EntityManager {
  /**
   * 实体仓库映射
   * 存储每个实体类型对应的仓库实例
   */
  readonly #entity_repository_map = new Map<EntityType, object>();

  /**
   * 实体缓存映射
   * 按实体类型存储实体实例，键为实体 id
   * 用于实现实体标识映射和缓存
   *
   * @remarks
   * 内层是 {@link EntityIdentityCache}（WeakRef）而非普通 Map：缓存只保证「同一条记录
   * 只有一个实例」，不负责让实例活着。详见该类的 说明。
   */
  readonly #entity_cache_map = new Map<EntityType, EntityIdentityCache<InstanceType<EntityType>>>();

  /**
   * 创建实体管理器实例
   *
   * 构造函数会：
   * 1. 为所有注册的实体类型添加静态和实例方法
   * 2. 设置实体关系处理
   * 3. 配置实体代理和删除检查
   *
   * @param rxdb - RxDB实例，提供数据库访问和事件分发
   */
  constructor(public readonly rxdb: RxDB) {
    rxdb
      .repository('Repository', {
        class: Repository,
        mergeOperations: {
          create: merge_create,
          update: merge_update,
          remove: merge_remove
        }
      })
      .repository('TreeRepository', {
        class: TreeRepository,
        mergeOperations: {
          create: merge_create,
          update: merge_update,
          remove: merge_remove
        }
      });
  }

  init() {
    // 跨实体聚合校验前置：违规时一条都不绑定，`resolveEntityManager()` 对所有实体一致失败。
    // 传数据库级 sync：实体不写 `sync` 时生效的是它，只看元数据会漏掉库级 QueryCache 的组合违规。
    const violations = validateEntityMetadataSet(
      this.rxdb.config.entities.map(EntityType => getEntityMetadata(EntityType)),
      this.rxdb.config.sync
    );
    if (violations.length > 0) {
      throw new RxDBError(formatMetadataViolations(violations));
    }

    const boundTypes: EntityType[] = [];
    try {
      // 批量处理所有注册的实体类型
      this.rxdb.config.entities.forEach(EntityType => {
        const metadata = getEntityMetadata(EntityType);
        setRuntimeObjectKey(metadata, ENTITY_TYPE, EntityType);
        const config = this.rxdb.getRepositoryConfig(metadata.repository);
        if (!config) {
          throw new RxDBError(`Repository '${metadata.repository}' not found for entity '${metadata.name}'`);
        }

        registerEntityManager(EntityType, this);
        boundTypes.push(EntityType);
        setRuntimeObjectGetter(EntityType.prototype, ENTITY_MANAGER, () => resolveEntityManager(EntityType));

        const repositoryType: typeof RepositoryBase = config.class as unknown as typeof RepositoryBase;
        const staticMethods = Array.isArray(repositoryType.staticMethods) ? repositoryType.staticMethods : [];
        staticMethods.forEach(methodName =>
          setRuntimeObjectKey(EntityType, methodName, (...args: unknown[]) => {
            const manager = resolveEntityManager(EntityType);
            const repository = manager.#get_entity_repository(EntityType) as unknown as Record<
              string,
              (...methodArgs: unknown[]) => unknown
            >;
            return repository[methodName](...args);
          })
        );

        // 添加实例方法到实体原型。方法从实例自身读取 manager，避免跨库重绑定。
        Object.keys(PROTOTYPE_METHODS).forEach(methodName =>
          setRuntimeObjectKey(EntityType.prototype, methodName, PROTOTYPE_METHODS[methodName])
        );
        // 添加可观察关系属性到实体原型。关系查询在 getter 中按实例 manager 解析。
        metadata.relationMap.forEach(relation => entity_relation_helper(relation, EntityType, this));
      });
    } catch (error) {
      boundTypes.forEach(EntityType => unregisterEntityManager(EntityType, this));
      throw error;
    }

    // PROXY 绑在管理器实例自身且不可重定义（`setSafeObjectKey` 的 `configurable: false`），
    // 而管理器会跨断连-重连存活。闭包只捕获 `this`，重绑没有任何意义，只会抛
    // `Cannot redefine property`，因此这里显式只装一次。
    if (Object.hasOwn(this, PROXY)) return;

    /**
     * 设置实体代理创建函数
     * 用于创建新的实体代理对象，并初始化其状态
     *
     * @param entity - 要代理的实体
     * @returns 代理后的实体实例
     */
    setSafeObjectKey(this, PROXY, (entity: InstanceType<EntityType>) => {
      // 初始化实体，设置为已修改但未保存到本地或远程
      const proxyEntity = this.#init_entity(entity, { local: false, remote: false, modified: true });

      // 入缓存必须**同步**：`createEntityRef` 是同步读缓存的，从前这一步也压在下面那个
      // 微任务里，于是同一 tick 内 `new Todo({ id })` 之后紧接着的 `createEntityRef(Todo, { id })`
      // 读不到任何东西，转而造出第二个实例并占掉缓存槽 —— 调用方手上那个成了孤儿，
      // 同一 id 从此有两个对象各持一份状态，对其中一个的编辑另一个永远看不见。
      this.addEntityCache(proxyEntity);

      // 事件派发**仍然**延后：监听器若在构造过程中被叫醒，拿到的是一个还没走完
      // 初始化的实例。这才是当初用微任务的理由，与入缓存无关。
      nextMicroTask(() => {
        const meta = getEntityMetadata(entity);
        const entity_new_event = new EntityLocalNewEvent([
          {
            type: 'NEW',
            namespace: meta.namespace,
            entity: meta.name,
            id: entity.id,
            patch: entity,
            inversePatch: null,
            recordAt: new Date()
          }
        ]);
        this.rxdb.dispatchEvent(entity_new_event);
      });

      return proxyEntity;
    });
  }

  /**
   * 清理所有缓存
   */
  cleanAllCache() {
    this.#entity_repository_map.forEach(repository => {
      if (repository && typeof (repository as { destroy?: () => void }).destroy === 'function') {
        (repository as { destroy: () => void }).destroy();
      }
    });
    this.#entity_cache_map.clear();
    this.#entity_repository_map.clear();
  }

  /**
   * 销毁管理器并解除实体类绑定
   */
  destroy() {
    this.cleanAllCache();
    this.rxdb.config.entities.forEach(EntityType => unregisterEntityManager(EntityType, this));
  }

  /**
   * 在当前数据库上下文中构造实体。
   * 多个数据库共用一个 Entity class 时，直接 `new Entity()` 无法判断目标数据库，
   * 应使用该方法保留实体构造函数的默认值和自定义初始化逻辑。
   */
  instantiate<T extends EntityType>(EntityType: T, initData?: Partial<InstanceType<T>>): InstanceType<T> {
    return withEntityManagerContext(EntityType, this, () => {
      const EntityConstructor = EntityType as unknown as new (data?: Partial<InstanceType<T>>) => InstanceType<T>;
      return new EntityConstructor(initData);
    });
  }

  /**
   * 创建实体引用
   * 根据提供的数据创建或获取实体实例，并设置其状态
   * 如果实体已存在于缓存中，则返回缓存的实例
   *
   * @template T 实体类型
   * @param EntityType - 实体类型
   * @param data - 实体数据，必须包含id
   * @param [status] - 可选的实体状态配置
   * @returns 创建或获取的实体实例
   */
  createEntityRef<T extends EntityType>(EntityType: T, data: EntityUpdateData<T>, status?: EntityStatusOptions<T>) {
    const cache = this.#get_entity_cache_map(EntityType);
    let entity = cache.get(data.id);
    if (entity) {
      // 命中缓存不能无条件 replace：脏实体的本地编辑会被写进基线后清空，save() 随即静默 no-op。
      // 策略判定统一收在 EntityStatus.applyExternal 里（见其 remarks）。
      getEntityStatus(entity).applyExternal(data);
      return entity;
    } else {
      entity = Object.create(EntityType.prototype);
      Object.assign(entity, data);
      const proxyEntity = this.#init_entity(entity, status);
      cache.set(entity.id, proxyEntity);
      return proxyEntity;
    }
  }

  /**
   * 获取实体引用
   * 从缓存中获取指定ID的实体实例
   *
   * @template T 实体类型
   * @param EntityType - 实体类型
   * @param id - 实体ID
   * @returns 实体实例，如果不存在则返回 undefined
   */
  getEntityRef<T extends EntityType>(EntityType: T, id: EntityStaticType<T, 'idType'>): InstanceType<T> | undefined {
    return this.#get_entity_cache_map(EntityType).get(id);
  }

  /**
   * 检查实体是否在缓存中
   * 判断指定ID的实体是否已在缓存中初始化
   *
   * @template T 实体类型
   * @param EntityType - 实体类型
   * @param id - 实体ID
   * @returns 如果实体在缓存中存在则返回 true
   */
  hasEntityRef<T extends EntityType>(EntityType: T, id: EntityStaticType<T, 'idType'>): boolean {
    return this.#get_entity_cache_map(EntityType).has(id);
  }

  /**
   * 添加实体到缓存
   * 将实体实例添加到对应类型的缓存映射中
   *
   * @template T 实体类型
   * @param entity - 要缓存的实体实例
   */
  addEntityCache<T extends EntityType>(entity: InstanceType<T>) {
    this.#get_entity_cache_map(entity.constructor).set(entity.id, entity);
  }

  /**
   * 从缓存中删除实体
   * 将实体实例从缓存映射中移除
   *
   * @template T 实体类型
   * @param entity - 要移除的实体实例
   */
  removeEntityCache<T extends EntityType>(entity: InstanceType<T>) {
    this.#get_entity_cache_map(entity.constructor).delete(entity.id);
  }

  /**
   * 保存实体
   * 根据实体状态决定是创建新实体还是更新现有实体
   * 如果有关联实体需要保存，会使用事务进行批量保存
   *
   * @template T 实体类型
   * @param data - 要保存的实体实例
   * @returns 保存后的实体实例
   */
  async save<T extends EntityType>(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const need_save_entities = getNeedSaveEntities([entity]);
    const need_remove_entities = getNeedRemoveEntities([entity]);
    // 单条与批量都走同一套判定：`resolveBatchPrimaryAdapter` 选主端，
    // QueryCache 批次另走 remote-then-local（见 `mutations`）。
    if (need_save_entities.length === 1 && need_remove_entities.length === 0) {
      const single = need_save_entities[0];
      const status = getEntityStatus(single);
      if (status.local) {
        await this.update(single);
      } else {
        await this.create(single);
      }
    }
    // 单个删除
    else if (need_save_entities.length === 0 && need_remove_entities.length === 1) {
      await this.remove(need_remove_entities[0]);
    }
    // 批量保存或删除
    else if (need_save_entities.length || need_remove_entities.length) {
      const options = getEntityMutations({
        need_save_entities,
        need_remove_entities
      });
      await this.mutations(options);
    }
    return entity;
  }

  /**
   * 批量保存
   * @param entities
   * @returns
   */
  async saveMany<T extends EntityType>(entities: InstanceType<T>[]) {
    const need_save_entities = getNeedSaveEntities(entities);
    const options = getEntityMutations({
      need_save_entities,
      need_remove_entities: []
    });
    return this.mutations(options);
  }

  /**
   * 批量删除
   * @param entities
   * @returns
   */
  async removeMany<T extends EntityType>(entities: InstanceType<T>[]) {
    const options = getEntityMutations({
      need_save_entities: [],
      need_remove_entities: entities
    });
    return this.mutations(options);
  }

  /**
   * 批量修改实体（创建/更新/删除）
   * @param options 批量修改选项
   */
  async mutations<T extends EntityType>(options: RxDBMutationsMap<T>) {
    // 批量与单条共用同一个主适配器选择器：`Repository.primary$` 也走
    // `selectPrimaryAdapterKind`。此前批量硬等 `localAdapter$`，remote-only 配置下那条流
    // 永不发射，`firstValueFrom` 静默挂起——调用方拿到一个不会 settle 的 Promise。
    // 主端缺适配器或批内主端不一致时就地抛错，不再让它挂着。
    const EntityTypes = collectMutationEntityTypes(options as RxDBMutationsMap);
    const primary = resolveBatchPrimaryAdapter(EntityTypes, this.rxdb.config.sync);
    if (primary === null) return [];
    // 主端判定在前：这样「QueryCache + remote-only」报的是主端不一致，
    // 而不是被 `isQueryCacheBatch` 当成「版本化实体」误报（US-020 AC#5 / AC#6）。
    if (isQueryCacheBatch(EntityTypes, this.rxdb.config.sync)) {
      return this.#mutations_query_cache(options);
    }
    const adapter$: Observable<IRxDBAdapter> =
      primary.kind === 'remote' ? this.rxdb.remoteAdapter$ : this.rxdb.localAdapter$;
    const adapter = await firstValueFrom(adapter$);
    return adapter.mutations(options);
  }

  /**
   * 删除实体
   * 从数据库中删除实体，并分发相关事件
   *
   * @template T 实体类型
   * @param data - 要删除的实体实例
   * @returns 删除后的实体实例
   * @throws 如果删除失败，抛出错误
   */
  async remove<T extends EntityType>(data: InstanceType<T>): Promise<InstanceType<T>> {
    const EntityType = data.constructor as EntityType;
    const entity = await this.#get_entity_repository(EntityType).remove(data);
    return entity;
  }

  /**
   * 重置实体
   *
   * @remarks
   * 这里此前是 `async`，而 `EntityBase.reset` 及三处系统实体都声明
   * `reset: () => void` —— 声明与运行时对不上（实际返回 `Promise<void>`）。
   * 这个方法只把 `status` 回滚到 `origin`，**不碰任何 I/O**，
   * 所以正解是让实现变同步去迎合声明，而不是把 4 处声明改成 `Promise<void>`：
   * 后者会让所有既有的 `entity.reset()` 调用点凭空多出一个未处理的 Promise。
   */
  reset<T extends EntityType>(data: InstanceType<T>): void {
    const status = getEntityStatus(data);
    if (status.modified) {
      status.reset();
    }
  }

  /**
   * 创建实体
   * 在数据库中创建新实体，并分发相关事件
   *
   * @template T 实体类型
   * @param data - 要创建的实体实例
   * @returns 创建后的实体实例
   * @throws 如果创建失败，抛出错误
   */
  async create<T extends EntityType>(data: InstanceType<T>): Promise<InstanceType<T>> {
    const EntityType = data.constructor as EntityType;
    const entity = await this.#get_entity_repository(EntityType).create(data);
    return entity;
  }

  /**
   * 更新实体
   * 在数据库中更新实体，只更新已修改的属性，并分发相关事件
   *
   * @template T 实体类型
   * @param data - 要更新的实体实例
   * @returns 更新后的实体实例
   * @throws 如果更新失败，抛出错误
   */
  async update<T extends EntityType>(data: InstanceType<T>): Promise<InstanceType<T>> {
    const EntityType = data.constructor as EntityType;
    const status = getEntityStatus(data);
    // modified 只记录"被写过"，patch 为 {} 表示值已改回 origin，无真实变更，不产生 UPDATE
    if (status.modified && Object.keys(status.patch).length > 0) {
      const entity = await this.#get_entity_repository(EntityType).update(data, status.patch);
      return entity;
    }
    return data;
  }

  /**
   * 通知外部更新
   * 当通过 rawQuery 等方式绕过 ORM 直接修改数据库后，
   * 调用此方法触发标准事件流（QueryCache 更新 + 跨 tab 广播）
   *
   * @param EntityType 实体类型
   * @param id 实体 ID
   * @param patch 变更的字段
   */
  notifyExternalUpdate<T extends EntityType>(
    EntityType: T,
    id: EntityStaticType<T, 'idType'>,
    patch: Readonly<Partial<InstanceType<T>>>
  ): void {
    const metadata = getEntityMetadata(EntityType);
    const event = new EntityLocalUpdatedEvent([
      {
        type: 'UPDATE',
        namespace: metadata.namespace,
        entity: metadata.name,
        id,
        patch,
        inversePatch: {} as Readonly<Partial<InstanceType<T>>>,
        recordAt: new Date()
      }
    ]);
    this.rxdb.dispatchEvent(event);
  }

  /**
   * 获取实体仓库
   * 获取指定实体类型的仓库实例
   *
   * @template T 实体类型
   * @param EntityType - 实体类型
   * @returns 实体仓库实例
   */
  getRepository<T extends EntityType, RT extends Repository<T>>(EntityType: T): RT {
    return this.#get_entity_repository(EntityType);
  }

  /**
   * 获取或创建实体仓库
   * 根据实体元数据中的repository配置创建对应类型的仓库
   *
   * @template T 实体类型
   * @template RT 仓库类型
   * @param EntityType - 实体类型
   * @returns 实体仓库实例
   * @throws {RxDBError} 如果仓库类型无效
   */
  /**
   * QueryCache 批次的写路径：逐条走 `Repository`，即 remote-then-local。
   *
   * @remarks
   * 不走 `adapter.mutations()`（US-020 D3）：本地那条会把缓存写进 changelog，
   * 远端那条不会 `upsertMany` 回 sqlite——两条都不是 QueryCache 的语义。
   *
   * **本批不是原子的**：QueryCache 的写按实体逐条打远端，中途失败时前面几条已经写出去了。
   * 远端事务不在本引擎的控制范围内，与其假装原子，不如让失败原样上抛。
   */
  async #mutations_query_cache<T extends EntityType>(options: RxDBMutationsMap<T>): Promise<InstanceType<T>[]> {
    const results: InstanceType<T>[] = [];
    for (const entity of flattenMutationEntities(options.create)) results.push(await this.create(entity));
    for (const entity of flattenMutationEntities(options.update)) results.push(await this.update(entity));
    for (const entity of flattenMutationEntities(options.remove)) results.push(await this.remove(entity));
    return results;
  }

  #get_entity_repository<T extends EntityType, RT extends Repository<T>>(EntityType: T): RT {
    if (!this.#entity_repository_map.has(EntityType)) {
      const meta = getEntityMetadata(EntityType);
      if (!meta) throw new RxDBError('meta not found');
      const config = this.rxdb.getRepositoryConfig(meta.repository);
      if (!config) {
        throw new RxDBError(`Repository '${meta.repository}' not found`);
      }
      const entityRepository = new config.class(this.rxdb, EntityType) as RT;
      this.#entity_repository_map.set(EntityType, entityRepository);
      return entityRepository;
    }
    return this.#entity_repository_map.get(EntityType)! as unknown as RT;
  }

  /**
   * 获取实体缓存映射
   * 获取指定实体类型的缓存映射，如果不存在则创建
   *
   * @template T 实体类型
   * @param EntityType - 实体类型
   * @returns 实体缓存映射
   */
  #get_entity_cache_map<T extends EntityType>(EntityType: T) {
    if (this.#entity_cache_map.has(EntityType) === false) {
      this.#entity_cache_map.set(EntityType, new EntityIdentityCache());
    }
    return this.#entity_cache_map.get(EntityType)!;
  }

  /**
   * 初始化实体
   * 设置实体的状态和代理，使其可以跟踪变更
   *
   * @template T 实体类型
   * @param entity - 要初始化的实体实例
   * @param [status] - 可选的实体状态配置
   * @returns 初始化后的代理实体实例
   */
  #init_entity<T extends EntityType>(entity: InstanceType<T>, status?: EntityStatusOptions<T>) {
    setSafeObjectKey(entity, ENTITY_MANAGER, this);
    const newStatus = new EntityStatus(this.rxdb, { target: entity, ...status });
    setSafeObjectWritableKey(entity, STATUS, newStatus);
    const proxyEntity = createEntityProxy(entity);
    setSafeObjectKey(newStatus, 'proxyTarget', proxyEntity);
    return proxyEntity;
  }
}

const entityManagers = new WeakMap<EntityType, Set<EntityManager>>();
const entityManagerContexts = new WeakMap<EntityType, EntityManager[]>();

const registerEntityManager = (EntityType: EntityType, manager: EntityManager) => {
  let managers = entityManagers.get(EntityType);
  if (!managers) {
    managers = new Set();
    entityManagers.set(EntityType, managers);
  }
  managers.add(manager);
};

const unregisterEntityManager = (EntityType: EntityType, manager: EntityManager) => {
  const managers = entityManagers.get(EntityType);
  if (!managers) return;
  managers.delete(manager);
  if (managers.size === 0) entityManagers.delete(EntityType);
};

const resolveEntityManager = (EntityType: EntityType): EntityManager => {
  const context = entityManagerContexts.get(EntityType);
  if (context?.length) return context[context.length - 1];

  const managers = entityManagers.get(EntityType);
  const entityName = getEntityMetadata(EntityType).name;
  if (!managers || managers.size === 0) throw new RxDBError(`Entity '${entityName}' needs an initialized RxDB`);
  if (managers.size > 1) {
    throw new RxDBError(
      `Entity '${entityName}' is registered with multiple RxDB instances; use rxdb.entityManager or repository`
    );
  }
  return managers.values().next().value!;
};

const withEntityManagerContext = <T>(EntityType: EntityType, manager: EntityManager, callback: () => T): T => {
  const context = entityManagerContexts.get(EntityType) ?? [];
  context.push(manager);
  entityManagerContexts.set(EntityType, context);
  try {
    return callback();
  } finally {
    context.pop();
    if (context.length === 0) entityManagerContexts.delete(EntityType);
  }
};

/**
 * 实体原型方法定义
 * 定义添加到实体原型上的方法
 *
 * `this` 在运行时是 entity instance（绑定在 prototype 上调用），显式标注类型避免 noImplicitThis 报错。
 */
const PROTOTYPE_METHODS: Record<string, (this: InstanceType<EntityType>) => unknown> = {
  save: function (this: InstanceType<EntityType>) {
    return getEntityManager(this).save(this);
  },
  remove: function (this: InstanceType<EntityType>) {
    return getEntityManager(this).remove(this);
  },
  reset: function (this: InstanceType<EntityType>) {
    return getEntityManager(this).reset(this);
  }
};

const getEntityManager = (entity: InstanceType<EntityType>): EntityManager => {
  const manager = (entity as unknown as { [ENTITY_MANAGER]?: EntityManager })[ENTITY_MANAGER];
  if (!manager) throw new RxDBError('Entity is not attached to an initialized RxDB');
  return manager;
};
