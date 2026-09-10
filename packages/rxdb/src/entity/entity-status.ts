import { isEqual, pick } from '@aiao/utils';
import { shareReplay, Subject } from 'rxjs';
import { RxDB } from '../RxDB.js';
import { getEntityStatus } from '../rxdb-utils.js';
import { getRxDBEntityIdentityKey } from '../system/change-codec.js';
import { EntityPatch, IEntityStatus } from './entity-status.interface.js';
import { EntityType } from './entity.interface.js';
import { setSafeObjectKey } from './entity.utils.js';
import { EntityRelationMetadata } from './metadata-options.interface.js';
import { EntityRelationCache, RelationObservableEntry } from './relation-cache.js';

/**
 * `_patches` 历史记录上限
 *
 * `patches`/`patches$` 是公开 API，供撤销/重做类场景订阅；`checkChange` 目前对每次
 * 防抖后的属性变更无条件 push，编辑器式长会话没有这道上限会无界增长。
 * 超出上限后丢弃最旧记录（先进先出），与常见编辑器撤销历史的有界语义一致。
 */
const MAX_PATCH_HISTORY = 100;

/**
 * 实体状态管理器
 *
 * 职责：
 * 1. 状态跟踪：local/remote/modified/removed 标记实体的生命周期状态
 * 2. 变更记录：记录实体的所有变更历史（patches），支持撤销/重做
 * 3. 关系管理：维护实体间的关系缓存，处理级联操作
 * 4. 变更通知：通过 RxJS Subject 发布实体变更事件
 *
 * 架构设计：
 * - 使用 Proxy 拦截属性修改，自动记录变更
 * - 关系缓存由 EntityRelationCache 子模块管理（含多对多 Junction 延迟删除）
 * - 懒加载缓存（patch/fingerprint），按需计算避免性能浪费
 *
 * @template T 实体类型
 */
export class EntityStatus<T extends EntityType> implements IEntityStatus<T> {
  /**
   * 关系缓存（含多对多 Junction 延迟删除）
   *
   * 从 EntityStatus 抽离的关系子模块；详见 `relation-cache.ts`。
   * EntityStatus 的 add/remove/clean RelationEntity 公共 API 全部委托到这里。
   */
  readonly #relations = new EntityRelationCache(
    () => this.target,
    () => this.proxyTarget
  );

  /**
   * 变更事件发布器
   * 每次调用 checkChange 时发布最新的 patches 数组
   * 使用 shareReplay(1) 确保新订阅者能立即收到最近的变更记录
   */
  #patches = new Subject<EntityPatch<T>[]>();

  /**
   * 增量变更记录
   * 只记录被修改的属性键，用于优化 patch 计算
   * @private
   */
  #changed_keys = new Set<keyof InstanceType<T>>();

  /**
   * reset/replace 各自递增的代数
   *
   * proxy.ts 的属性 set 拦截用 `queueMicrotask` 防抖 checkChange：多次同步赋值只排队一次。
   * 若 reset()/replace() 在这个微任务触发前同步执行，#changed_keys/_patches 已被清空，
   * 但排队的回调不知情，稍后仍会执行一次 checkChange() 并补发一条空 patch。
   * proxy.ts 在排队时记下当时的 generation，微任务触发时对比，代数变了就跳过，
   * 而不是抑制 checkChange() 本身（后者是无条件记录的公开行为，其他调用方依赖这一点）。
   */
  #generation = 0;

  /**
   * 内容修订号：{@link EntityStatus.fingerprint} 的第三段，专门用来表达
   * 「外部事件改了业务字段但没改 `updatedAt`」这类前两段编码不出来的变化。
   *
   * 只由 {@link EntityStatus.markContentChanged} 推进，理由见那里。
   * 与 {@link #generation} 的区别：那个由 reset/replace 递增，用来作废排队中的防抖回调，
   * 跟指纹无关。
   */
  #content_revision = 0;

  /**
   * 标识实体是否存在于远程数据库
   */
  protected _remote: boolean;

  /**
   * 标识实体是否存在于本地数据库
   */
  protected _local: boolean;

  /**
   * 标识实体是否已被修改
   */
  protected _modified: boolean;

  /**
   * 标识实体是否已被删除
   */
  protected _removed: boolean = false;

  /**
   * 实体变更记录数组
   */
  protected _patches: EntityPatch<T>[];

  /**
   * 实体变更缓存
   */
  protected _patch_cache?: Partial<InstanceType<T>>;

  /**
   * 实体原始数据
   * 用于比较变更和恢复
   */
  protected _origin!: InstanceType<T>;

  /**
   * 实体指纹
   * 用于唯一标识实体的版本
   */
  protected _fingerprint?: string;

  /**
   * 实体原始对象
   */
  readonly target!: InstanceType<T>;

  /**
   * 实体代理对象
   * 用于拦截并记录对象的属性访问和修改
   */
  readonly proxyTarget!: InstanceType<T>;

  /**
   * 实体变更记录的可观察流
   * 用于订阅实体变更
   */
  readonly patches$ = this.#patches.asObservable().pipe(shareReplay(1));

  /**
   * 实体是否已修改
   * 标记实体属性是否发生过变更（与 origin 对比）
   */
  get modified() {
    return this._modified;
  }

  /**
   * 设置修改状态
   * 清理缓存确保下次访问 patch/fingerprint 时重新计算
   *
   * **不推进内容修订号**：这条路看着像「本地编辑入口」，实际上适配器把查询算出来的
   * computed 列写回共享缓存实体走的也是它（`m[prop] = value` → proxy set → 这里）。
   * 在这里推进会让树查询把自己的回填看成「结果变了」而再发一次 —— 自激。
   */
  set modified(value: boolean) {
    this._modified = value;
    this.#clear_cache(false);
  }

  /**
   * 是否已删除
   */
  get removed() {
    return this._removed;
  }
  set removed(value: boolean) {
    this._removed = value;
  }

  /**
   * 是否是远程数据
   */
  get remote() {
    return this._remote;
  }
  set remote(value: boolean) {
    this._remote = value;
  }

  /**
   * 是否是本地数据
   */
  get local() {
    return this._local;
  }
  set local(value: boolean) {
    this._local = value;
  }

  /**
   * 当前变更内容（相对于 origin）
   * 返回与 origin 不同的属性集合，用于生成数据库更新语句
   *
   * 优化：只比较被修改过的属性键，避免全量遍历
   *
   * 比较用 `isEqual` 深比较，与 Proxy set 拦截（proxy.ts）保持同一套相等语义。
   * 必须深比较：适配器保存成功后会用 `structuredClone` 回填 origin，
   * 引用比较会让 Date / json / 数组列永久残留假 diff，导致每次 UPDATE 重复写回。
   *
   * 边界（继承自 `isEqual`）：自定义了 `toString()` 的值按 `toString()` 结果判等，
   * 不看字段。若某列存的是这类对象（URL / Error / 领域值对象），两个 `toString()`
   * 相同但字段不同的实例会被判为「没变」→ 该键不进 patch → 静默丢写。
   * 这类列请存可序列化的普通对象，或自行在赋值前 normalize。
   *
   * 注意：返回 `{}` 表示"无真实变更"（与 origin 相等），不返回 null。
   * 类型签名取消 `| null`，与运行时行为对齐。
   */
  get patch(): Partial<InstanceType<T>> {
    if (this._patch_cache) return this._patch_cache;
    // 增量计算：只比较已修改的属性
    const cache: Partial<InstanceType<T>> = {};
    const { proxyTarget, origin } = this;
    for (const key of this.#changed_keys) {
      if (!isEqual(proxyTarget[key], origin[key])) {
        cache[key] = proxyTarget[key];
      }
    }
    this._patch_cache = cache;
    return cache;
  }

  /**
   * 逆向变更内容（用于撤销操作）
   * 返回 origin 中对应 patch 的属性值
   *
   * 例如：patch = { name: 'new' }  →  inversePatch = { name: 'old' }
   *
   * 注意：返回 `{}` 表示"无真实变更"，不返回 null。
   */
  get inversePatch(): Partial<InstanceType<T>> {
    return pick(this.origin, Object.keys(this.patch)) as Partial<InstanceType<T>>;
  }

  /**
   * 获取变化
   */
  get patches() {
    return this._patches;
  }

  /**
   * 当前代数，每次 reset()/replace() 递增一次。
   * 供 proxy.ts 判断某次防抖排队的 checkChange 是否已经过期，见 #generation 声明处注释。
   */
  get generation() {
    return this.#generation;
  }

  /**
   * 设置原始值
   */
  set origin(value: InstanceType<T>) {
    this._origin = value;
  }
  get origin() {
    return this._origin;
  }

  /**
   * 实体指纹（标识**同一个引用**的内容版本）
   * 格式：`${id}@${updatedAt.getTime()}@${内容修订号}`
   *
   * 用途：
   * - 判断同一个实体引用的内容是否已被改动（`QueryTask.#next` 据此决定要不要发射）
   * - 缓存键生成
   * - 冲突检测
   *
   * @remarks
   * 第三段是 {@link EntityStatus} 实例内部的**内容修订号**：可见值真的被改动过才 +1
   * （本地编辑、`reset` 撤销掉真实差异、`replace`/`mergeExternal` 写入了不同的值）；
   * 纯派生缓存失效（`invalidateCache`、保存完成的 `modified = false`、写回同样的值）不推进。
   * 加它是因为前两段不够：
   * 外部增量回填**不保证带 `updatedAt`**（`notifyExternalUpdate` 的 patch 可以只有业务字段，
   * `QueryManager` 还会专门丢掉「只有 `updatedAt`」的 patch），于是「值变了但 `updatedAt` 没变」
   * 在旧格式下算不出差异，活查询永远停在旧值上。
   *
   * 因此本指纹**只能沿时间轴比较同一个引用**：修订号是实例内计数，不同 `EntityStatus`
   * 实例之间不可比 —— 两个刚水合的引用都是 0，但各自改过之后的号码没有可比性。
   * 「两个引用是不是同一行的同一版本」请比 `id` + `updatedAt`，不要比整串指纹。
   *
   * 懒加载：首次访问时生成并缓存；读取本身不推进修订号。
   */
  get fingerprint() {
    if (!this._fingerprint) {
      // updatedAt 类型上是 Date，但跨存储后端（SQL）可能回填字符串，运行时兼容两种
      const raw: Date | string | number | null | undefined = this.target.updatedAt;
      const updatedAt = raw ? (raw instanceof Date ? raw : new Date(raw)).getTime() : 0;
      this._fingerprint = `${getRxDBEntityIdentityKey(this.target.id)}@${updatedAt}@${this.#content_revision}`;
    }
    return this._fingerprint;
  }

  /**
   * 创建实体状态实例
   *
   * @constructor
   * @param rxdb - RxDB 实例
   * @param data - 实体状态初始数据
   */
  constructor(
    public readonly rxdb: RxDB,
    data: IEntityStatus<T>
  ) {
    setSafeObjectKey(this, 'target', data.target);
    // 配置默认值
    this._local = data.local || false;
    this._remote = data.remote || false;
    this._modified = data.modified || false;
    this._origin = structuredClone({ ...data.target });
    this._patches = data.patches || [];
    // 让一些数据不可迭代
    ['_local', '_modified', '_origin', '_patch_cache', '_patches', '_remote', '_removed', 'patches$', 'rxdb'].forEach(
      key =>
        Object.defineProperty(this, key, {
          enumerable: false,
          configurable: false
        })
    );
  }

  /**
   * 记录属性变更
   * 在 Proxy set 拦截时调用，同步记录哪些属性被修改
   * @param key - 被修改的属性键
   */
  markChanged(key: keyof InstanceType<T>) {
    this.#changed_keys.add(key);
  }

  /**
   * 重置实体状态到初始状态（origin）
   *
   * 操作：
   * 1. 删除 proxyTarget 上 origin 没有的 key（ ：`createEntityRef` 稀疏水合场景下
   *    构造后才新增的属性在 origin 里从未存在过，仅 Object.assign 无法把它们清除）
   * 2. 恢复 proxyTarget 的所有属性到 origin 的值
   * 3. 清除 modified 标记
   * 4. 清空变更历史（patches）
   * 5. 递增 generation，作废此前排队但尚未触发的防抖 checkChange（见 #generation 注释）
   * 6. 发布空的变更事件
   *
   * 使用场景：撤销所有未保存的修改
   */
  reset() {
    const target = this.proxyTarget as Record<string, unknown>;
    const origin = this.origin as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      if (!(key in origin)) delete target[key];
    }
    Object.assign(target, origin);
    this._modified = false;
    // 撤销的是本地未保存的编辑，与「本地编辑本身不推进修订号」对称（见 set modified）
    this.#clear_cache(false);
    this.#changed_keys.clear();
    this._patches = [];
    this.#generation++;
    this.#patches.next(this._patches);
  }

  /**
   * 使用外部数据重新同步当前实体引用
   * 用于查询缓存命中后的安全回填，避免通过 Proxy 误记用户修改。
   *
   * 注意：本地 _removed 标志不被清除，避免缓存回填"复活"已标记删除的实体。
   * 用户主动标记删除的状态不应被远端缓存回填覆盖。
   */
  replace(data: Partial<InstanceType<T>>) {
    Object.assign(this.target, data);
    this._origin = structuredClone(this.target);
    this._modified = false;
    // _removed 不重置：local-first 语义保留用户的删除意图
    // 不推进内容修订号：本方法同时服务「查询结果整行回填」和「外部事件应用」两类调用者，
    // 前者写回的正是查询自己刚算出来的值（含 SQL 派生列），在这里推进会让查询自激发射。
    // 外部事件那一路由 `applyExternalEntityUpdate` 显式调 {@link markContentChanged}。
    this.#clear_cache(false);
    this.#changed_keys.clear();
    this.#relations.clear();
    this._patches = [];
    // 与 reset 同理：作废此前排队但尚未触发的防抖 checkChange
    this.#generation++;
    this.#patches.next(this._patches);
  }

  /**
   * 应用外部更新，但**逐字段避让**本地未保存的编辑。
   *
   * @param data 外部事件负载（增量字段）
   *
   * @remarks
   * 与 {@link replace} 的区别在于「脏实体」的处理：`replace` 会 `Object.assign` 到 target
   * 并重设 `_origin`、把 `_modified` 归零 —— 用户尚未保存的编辑被一并写进基线后 patch 清空，
   * UI 看起来没变，下一次 `save()` 却静默 no-op，编辑永久丢失。
   *
   * 这里的语义是：
   * - `_origin` 基线**一律前移**到外部值（撤销应回到外部推进后的状态，而非更早的陈旧值）；
   * - 当前 patch 中仍有真实差异的键**保留本地值**，不被外部值覆盖；
   * - 其余键同步为外部值。
   *
   * `patch` 随后按「当前值 vs 新基线」重算，因此外部值恰好等于本地编辑时会自然收敛为空
   * （确实无需再写）；`_modified` 也据此重算，而不是被无条件归零。
   */
  mergeExternal(data: Partial<InstanceType<T>>) {
    const target = this.target as Record<string, unknown>;
    const origin = this._origin as Record<string, unknown>;
    const protectedKeys = new Set(Object.keys(this.patch));

    for (const key of Object.keys(data) as (keyof InstanceType<T>)[]) {
      const incoming = (data as Record<string, unknown>)[key as string];
      // 基线一律前移
      origin[key as string] = structuredClone(incoming);
      // 当前 patch 没有真实差异的键才同步可见值；仍有本地编辑的保留本地值
      if (!protectedKeys.has(key as string)) {
        target[key as string] = incoming;
      }
    }

    // 不推进内容修订号：适配器写回 computed 列时会先经 proxy 把实体标脏，随后正是走这条分支
    // （`status.modified ? mergeExternal(row) : replace(row)`），在这里推进同样会自激
    this.#clear_cache(false);
    this.#relations.clear();
    // 按新基线重算是否仍有未保存改动，而不是无条件归零
    this._modified = Object.keys(this.patch).length > 0;
  }

  /**
   * 应用一份外部数据，并按实体当前是否有未保存编辑自动选择合并策略。
   *
   * @param data 外部数据（整行回填或增量 patch 均可）
   *
   * @remarks
   * 这是「外部数据落到已缓存实体」的**唯一**策略入口：
   *
   * - `modified === false`：走 {@link replace}，整行覆盖并重设基线；
   * - `modified === true`：走 {@link mergeExternal}，基线前移但逐字段避让本地编辑。
   *
   * 拆出这个方法而不是让各调用点自己判，是因为漏判的后果是静默的：直接 `replace` 一个脏实体
   * 会把用户尚未保存的编辑写进 `_origin` 并把 `_modified` 归零，`patch` 随之清空 —— UI 看起来
   * 没变，下一次 `save()` 却是 no-op，编辑永久丢失且全程无报错。查询结果回填、跨 tab 事件、
   * 远端活查询整批回填三条路径都会命中缓存实体，任一处漏判都会复现同一个 bug。
   *
   * 本方法**不做时效性判断**。调用方若可能收到迟到的事件，需先用 `isStaleEventPayload` 拦截。
   */
  applyExternal(data: Partial<InstanceType<T>>) {
    if (this.modified) {
      this.mergeExternal(data);
      return;
    }
    this.replace(data);
  }

  /**
   * 记录实体变更
   *
   * 机制：
   * 1. 计算当前 patch 和 inversePatch
   * 2. 将变更记录追加到 patches 数组
   * 3. 通过 Subject 发布变更事件
   *
   * 时间戳说明：
   * - recordAt: 业务时间（Date），用于显示和排序
   * - timeStamp: 性能时间（performance.now），用于高精度计时和排序
   *
   * @param recordAt 变更记录时间，默认当前时间
   */
  checkChange(recordAt = new Date()) {
    const record = {
      patch: this.patch,
      inversePatch: this.inversePatch,
      recordAt,
      timeStamp: performance.now()
    } satisfies EntityPatch<T>;

    this._patches.push(record);
    // 历史有界：超出上限丢弃最旧记录，防止长会话下无界增长
    if (this._patches.length > MAX_PATCH_HISTORY) {
      this._patches.shift();
    }
    this.#patches.next(this._patches);
  }

  /**
   * 获取需要保存的实体列表
   *
   * 逻辑：
   * 1. 始终包含当前实体（this.proxyTarget）
   * 2. 遍历所有关系类型的缓存
   * 3. 筛选出 modified=true 的关联实体
   *
   * 注意：
   * - 此方法只查找直接关联的实体，不递归
   * - 递归查找由 entity.utils.ts 的 getNeedSaveEntities 处理
   * - 返回的实体需要进一步过滤（根据依赖顺序排序）
   *
   * @returns 需要保存的实体数组（包含自身和修改过的关联实体）
   */
  getNeedSaveEntities() {
    const entities = new Set<InstanceType<T>>([this.proxyTarget]);
    this.#relations.forEachRelationSet(relationEntities => {
      for (const entity of relationEntities) {
        if (getEntityStatus(entity).modified) {
          entities.add(entity as InstanceType<T>);
        }
      }
    });
    return Array.from(entities);
  }

  /**
   * 获取需要删除的实体列表
   *
   * 删除策略：
   * - 多对多关系：删除 Junction 实体（中间表记录）
   * - 其他关系：不自动删除关联实体（由业务层决定）
   *
   * Junction 实体处理：
   * 1. removeRelationEntity 时加入 #remove_junction_set
   * 2. 保存时统一删除（保证事务一致性）
   * 3. 只删除 local=true 的（未保存的无需删除）
   *
   * 设计理由：
   * - ONE_TO_MANY/MANY_TO_ONE 的级联删除由数据库外键约束处理
   * - MANY_TO_MANY 没有直接的外键，需要应用层删除 Junction
   *
   * @returns 待删除的 Junction 实体数组
   */
  getNeedRemoveEntities() {
    const entities: InstanceType<EntityType>[] = [];
    for (const junctionEntity of this.#relations.getRemovableJunctions()) {
      if (getEntityStatus(junctionEntity).local) {
        entities.push(junctionEntity);
      }
    }
    return entities;
  } /**
   * 添加关系实体
   *
   * 多对多关系处理流程：
   * 1. 生成 Junction 查找条件（nameAId + nameBId）
   * 2. 检查当前实体的缓存，避免重复添加
   * 3. 在关联实体的缓存中查找已存在的 Junction
   * 4. 如果未找到或已标记删除，创建新的 Junction 实体
   * 5. 双向更新缓存：this.cache + entity.cache
   *
   * 其他关系类型：
   * - 直接添加到对应类型的缓存
   *
   * @param relation 关系元数据
   * @param entity 要关联的实体
   */
  /** 委托给 EntityRelationCache.add — 见 relation-cache.ts */
  addRelationEntity(relation: EntityRelationMetadata, entity: InstanceType<EntityType>) {
    this.#relations.add(relation, entity);
  }

  /** 委托给 EntityRelationCache.remove — 见 relation-cache.ts */
  removeRelationEntity(relation: EntityRelationMetadata, entity: InstanceType<EntityType>) {
    this.#relations.remove(relation, entity);
  }

  /** 委托给 EntityRelationCache.clean — 见 relation-cache.ts */
  cleanRelationEntity(relation: EntityRelationMetadata) {
    this.#relations.clean(relation);
  }

  /** 委托给 EntityRelationCache.get — 见 relation-cache.ts */
  getRelationCache(relation: EntityRelationMetadata) {
    return this.#relations.get(relation);
  }

  /** 委托给 EntityRelationCache.getObservableEntry — 见 relation-cache.ts */
  getRelationObservableEntry(relation: EntityRelationMetadata) {
    return this.#relations.getObservableEntry(relation);
  }

  /** 委托给 EntityRelationCache.setObservableEntry — 见 relation-cache.ts */
  setRelationObservableEntry(relation: EntityRelationMetadata, entry: RelationObservableEntry) {
    this.#relations.setObservableEntry(relation, entry);
  }

  invalidateCache(): void {
    // 纯派生缓存失效，内容没动 —— 不推进内容修订号
    this.#clear_cache(false);
  }

  /**
   * 声明「实体的可见内容刚被**外部事件**改动过」，推进内容修订号（{@link fingerprint} 第三段）。
   *
   * 这是**唯一**推进修订号的入口，且刻意只有一个调用方：`QueryManager` 把外部事件负载
   * 物化进缓存实体的那一步。所有改值的方法（{@link replace}、{@link mergeExternal}、
   * proxy set → `modified = true`）都不推进，因为它们同时是**查询自己回填结果**的路径：
   * 适配器把 SQL 算出来的 computed 列（`hasChildren`/`level`/…）写回共享缓存实体走的正是
   * 这几条，在它们内部推进会让查询把自己的回填看成「结果变了」而再发一次 —— 自激。
   *
   * 「这次写入来自外部事件」这个信息只有调用方知道，所以判断留给调用方；
   * 调用方同样有责任先确认可见值真的变了 —— 无条件调用会导致多余发射。
   */
  markContentChanged(): void {
    this.#clear_cache(true);
  }

  /**
   * 清理计算缓存
   * 在 modified 或其他需要重新计算的场景调用
   * 注意：不清理 #changed_keys，它是累积的源数据，仅在 reset() 时清除
   *
   * @param contentChanged 本次失效是否要推进内容修订号（{@link fingerprint} 的第三段）。
   * 参数无默认值是刻意的：本方法是所有失效路径的必经之处，强制每个调用点回答这个问题，
   * 新增路径就漏不掉。
   *
   * 目前只有 {@link markContentChanged} 传 `true`。「值变了」并不足以传 `true` ——
   * 判据是「这次改动来自**外部事件**」，而改值的那几个方法都同时服务查询结果回填，
   * 分不出来。少发是 的病，多发（查询自激）是它的过矫，两边都不能要。
   * @private
   */
  #clear_cache(contentChanged: boolean) {
    this._patch_cache = undefined;
    this._fingerprint = undefined;
    if (contentChanged) this.#content_revision++;
  }
}
