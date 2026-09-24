/**
 * @fileoverview 实体工具函数
 * 提供实体操作的通用工具函数
 */

import { isFunction } from '@aiao/utils';
import { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityStatus } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { EntityData, EntityInstanceType, EntityType } from './entity.interface.js';
import { PropertyType } from './metadata-options.interface.js';
import { EntityMetadata } from './metadata.interface.js';

const INTERNAL_ENTITY_KEYS: ReadonlySet<string> = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'rev'
]);

/**
 * 判断字段名是否是内部保留字段
 * 包括基类字段、私有字段和以下划线开头的字段
 *
 * @param key - 要检查的字段名
 * @returns 如果是内部保留字段则返回true，否则返回false
 */
export const isEntityInternalName = (key: string): boolean => INTERNAL_ENTITY_KEYS.has(key) || key.charCodeAt(0) === 95; // '_'

/**
 * 设置安全的不可变属性
 * 创建一个不可枚举、不可配置、不可写的属性
 *
 * @param object - 目标对象
 * @param key - 属性键
 * @param value - 属性值
 * @returns 修改后的对象
 */
export const setSafeObjectKey = <T extends object>(object: T, key: string | symbol, value: unknown) =>
  Object.defineProperty(object, key, {
    value: value,
    enumerable: false,
    configurable: false,
    writable: false
  }) as T;

/**
 * 设置可重绑定的运行时属性
 * 供 EntityManager 在不同 RxDB 实例之间重复绑定实体类时使用
 */
export const setRuntimeObjectKey = <T extends object>(object: T, key: string | symbol, value: unknown) =>
  Object.defineProperty(object, key, {
    value: value,
    enumerable: false,
    configurable: true,
    writable: false
  }) as T;

/**
 * 设置可重绑定的运行时 getter
 */
export const setRuntimeObjectGetter = <T extends object>(object: T, key: string | symbol, get: () => unknown) =>
  Object.defineProperty(object, key, {
    get,
    enumerable: false,
    configurable: true
  }) as T;

/**
 * 设置安全的可变属性
 * 创建一个不可枚举、不可配置但可写的属性
 *
 * @param object - 目标对象
 * @param key - 属性键
 * @param value - 属性值
 * @returns 修改后的对象
 */
export const setSafeObjectWritableKey = <T extends object>(object: T, key: string | symbol, value: unknown) =>
  Object.defineProperty(object, key, {
    value: value,
    enumerable: false,
    configurable: false,
    writable: true
  }) as T;

/**
 * 设置懒加载属性
 * 创建一个只在首次访问时计算值的属性，后续访问直接返回计算结果
 *
 * @param object - 目标对象
 * @param key - 属性键
 * @param init - 初始化函数，用于计算属性值
 * @returns 修改后的对象
 *
 * @remarks
 * 缓存靠闭包里的 `initialized` 标志，**不能**靠「首次访问时替换描述符里的 getter」：
 * `Object.defineProperty` 在调用当下就把 `get` 拷进了属性描述符，之后改源对象的 `get`
 * 对已安装的属性毫无影响；而 `configurable: false` 又禁止重新定义 —— 结果是每次访问都全量重算。
 *
 * `initialized` 在 `init()` **返回之后**才置位：初始化抛错不该被缓存成永久失败，下次访问重试。
 */
export const setSafeObjectKeyLazyInitOnce = <V>(object: object, key: string | symbol, init: () => V) => {
  let initialized = false;
  let value: V;
  return Object.defineProperty(object, key, {
    get: () => {
      if (!initialized) {
        value = init();
        initialized = true;
      }
      return value;
    },
    enumerable: false,
    configurable: false
  });
};

/**
 * 当前 {@link fillDefaultValue} 调用共享的「现在」；不在填充期间为 `undefined`。
 *
 * @remarks
 * 填充**可以**重入：默认值工厂同步 `new` 另一个实体时，那个实例的构造器会再进一次
 * `fillDefaultValue`。因此这里按**栈**使用——进入时压入本次时刻、退出时恢复调用方的那个，
 * 而不是退出时一律清空。清空的写法会让外层剩余字段掉回「读当下时钟」，
 * `createdAt === updatedAt` 于是随内层耗时随机失效。
 */
let fillInstant: Date | undefined;

/**
 * 默认值函数里的「现在」。
 *
 * @remarks
 * 同一次默认值填充里所有调用它的默认值拿到**同一个时刻**：`createdAt` 与 `updatedAt`
 * 各自 `new Date()` 时，两次调用会跨过毫秒边界，新建行的两个时间戳就差 1ms，
 * 「`updatedAt === createdAt` 即从未改过」这条不变量随机失效。
 *
 * 每次返回**新的** `Date` 实例（拷贝而非共享引用），两个字段不会互相别名。
 * 不在填充期间调用就是普通的当前时刻——它本来就没有可共享的时刻作用域。
 *
 * 嵌套填充各自持有自己的时刻（见 {@link fillInstant}）：内层实例是**另一行**，
 * 它的「创建于」不该被外层那一刻追认。内层结束后外层恢复到自己的时刻继续填。
 *
 * @returns 当次填充的时刻，或调用当下的时刻。
 *
 * @example
 * ```ts
 * { name: 'createdAt', type: PropertyType.date, default: () => entityDefaultNow() }
 * ```
 */
export const entityDefaultNow = (): Date => (fillInstant === undefined ? new Date() : new Date(fillInstant));

/**
 * `date` 属性的数据库端默认值哨兵。
 *
 * @remarks
 * 它**不是**一个 JS 值，是建表语句里的一段表达式：PGlite 建表器把它译成 `DEFAULT now()`，
 * SQLite 建表器译成 `strftime`。语义是「这一列的时间由数据库时钟给」，
 * 提交历史的 `createdAt` 正是靠它才不会把客户端时钟漂移写进不可变历史（FR-010）。
 *
 * 字面量在六个适配器的建表器里各有一份，这里不与它们共享常量：那要么让
 * `@aiao/rxdb` 反向依赖适配器，要么新开一个只装一个字符串的公开导出。
 */
const DATABASE_SIDE_TIMESTAMP_DEFAULT = 'CURRENT_TIMESTAMP';

/**
 * 给实体实例填充默认值
 * 根据元数据中定义的默认值，为实体的未赋值属性设置默认值
 *
 * @template T - 实体类型
 * @param metadata - 实体元数据
 * @param entity - 实体实例
 *
 * @remarks
 * {@link DATABASE_SIDE_TIMESTAMP_DEFAULT} 被跳过，该属性保持未赋值。这不是优化，是正确性：
 * 把这个字符串填进 `date` 属性，它会一路原样走到 INSERT ——
 * PGlite 报 `22007 invalid input syntax for type timestamp with time zone`，
 * `RxDB.connect()` 在建表阶段就炸；SQLite 是动态类型，照单收下这段文本，
 * 读回来 `new Date('CURRENT_TIMESTAMP')` 是 Invalid Date → `null`，一声不响地丢掉时间戳。
 *
 * 跳过之后该属性不出现在 INSERT 列清单里（两个适配器的 `normalizeCreateEntity` 都按
 * `value !== undefined` 取列：`useDefineForClassFields` 下键是恒在的，按键判定会把未赋值也
 * 写进列清单，DB 端默认值于是永远不生效），由建表时写下的 DB 端默认值补上；SQLite 的**批量** INSERT 是唯一的
 * 例外，它固定写全列、绕过了 DB DEFAULT，所以 `inserts_sql` 自己把哨兵解析成真实时间戳——
 * 那段代码此前是死的（它只在列缺省时才跑，而本函数总是先把字符串填满）。三条路径都已就位。
 *
 * 填充期间 {@link entityDefaultNow} 返回同一个时刻。默认值工厂同步 `new` 另一个实体会
 * **重入**本函数，所以时刻作用域按栈进出：结束（含抛错）恢复调用方的时刻，而不是清空——
 * 清空会让外层剩余字段掉回当下时钟，`createdAt === updatedAt` 这条不变量随内层耗时随机失效。
 */
export const fillDefaultValue = <T extends EntityType>(metadata: EntityMetadata, entity: InstanceType<T>) => {
  const callerInstant = fillInstant;
  fillInstant = new Date();
  try {
    const data = collectDefaultValue(metadata, entity);
    if (data) Object.assign(entity, data);
  } finally {
    fillInstant = callerInstant;
  }
};

/**
 * 深拷贝一个**静态默认值**，让每个实例拿到自己的副本。
 *
 * @param value - 元数据里声明的默认值（或默认值函数的返回值）
 * @returns 与 `value` 等价、但不与任何其他实例共享引用的值
 *
 * @remarks
 * `default` 写成字面量时，这个字面量在**元数据里只存在一份**：
 * `{ name: 'labels', type: PropertyType.stringArray, default: [] }` 直接赋给实例，
 * 意味着所有实例的 `labels` 是同一个数组——第一个实例 `push` 一下，
 * 后面每个新建实例的「默认值」就都带着上一条的数据，元数据本身也被改脏。
 *
 * 默认值函数的返回值同样拷贝：函数体里 `return SHARED` 闭包一个常量是合法写法，
 * 「是不是函数」并不能证明「每次都是新对象」。
 *
 * 只拷贝数据形态（`Uint8Array` / `Date` / 数组 / 纯对象），自定义类实例原样返回：
 * 结构化克隆会丢原型，比共享引用更糟。
 */
const cloneDefaultValue = (value: unknown): unknown => {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(cloneDefaultValue);
  if (!isPlainDefaultObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDefaultValue(item)]));
};

/** 判断默认值是不是可以逐键拷贝的「纯对象」（排除自定义类实例）。 */
const isPlainDefaultObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};

/**
 * 算出 `entity` 上所有仍是 `undefined` 的缺省属性的值。
 *
 * @returns 待写入的键值对；没有任何属性需要填充时返回 `undefined`。
 */
const collectDefaultValue = <T extends EntityType>(
  metadata: EntityMetadata,
  entity: InstanceType<T>
): Record<string, unknown> | undefined => {
  const data: Record<string, unknown> = {};
  let need = false;
  metadata.defaultValueProperties.forEach(property => {
    if (property.default !== DATABASE_SIDE_TIMESTAMP_DEFAULT && entity[property.name] === undefined) {
      need = true;
      const value = isFunction(property.default) ? property.default() : property.default;
      if (property.type === PropertyType.bigint && typeof value !== 'bigint') {
        throw new TypeError(`${property.name} default must be a bigint`);
      }
      if (property.type === PropertyType.binary && !(value instanceof Uint8Array)) {
        throw new TypeError(`${property.name} default must be a Uint8Array`);
      }
      data[property.name] = cloneDefaultValue(value);
    }
  });
  return need ? data : undefined;
};

/**
 * 给实体实例填充初始值（仅构造期使用）
 *
 * 覆盖 `fillDefaultValue` 已写入的默认值，**包括 readonly 字段**
 *（如 `id` / `createdAt`）。`readonly` 语义是「创建后不可改」，不是
 * 「构造时不可传入」；水合路径 `createEntityRef` 用 `Object.assign` 同样会设 id。
 *
 * readonly 的执行点在**适配器持久化层**，不在这里。这里再拦一道只会让
 * `new Entity({ id })` 静默丢掉调用方主键，不要「补回」构造期的 readonly 守卫。
 *
 * SQLite、PGlite 与 Supabase 均在更新边界调用 {@link normalizeUpdateEntity}；
 * `updatedAt` / `updatedBy` 等系统审计字段在过滤用户 patch 后由 adapter 单独注入。
 *
 * @template T - 实体类型
 * @param metadata - 实体元数据
 * @param entity - 实体实例
 * @param initValue - 初始值对象
 */
export const fillInitValue = <T extends EntityType>(
  metadata: EntityMetadata,
  entity: InstanceType<T>,
  initValue: Partial<InstanceType<T>>
) => {
  const { propertyMap, foreignKeyNames } = metadata;
  const foreignKeySet = foreignKeyNames.length ? new Set(foreignKeyNames) : null;
  for (const key of Object.keys(initValue)) {
    if (propertyMap.has(key) || foreignKeySet?.has(key)) {
      entity[key] = initValue[key];
    }
  }
};

/**
 * 规范化更新数据并过滤 readonly 字段。
 *
 * @param metadata - 实体元数据
 * @param entity - 用户提交的更新数据
 * @returns 以数据库列名为键的可写字段
 */
export const normalizeUpdateEntity = (metadata: EntityMetadata, entity: EntityData): EntityData => {
  const result: EntityData = {};

  for (const [key, property] of metadata.propertyMap) {
    if (key in entity && property.readonly !== true) {
      result[property.columnName] = entity[key];
    }
  }

  // 走 keyed 的 foreignKeyRelationMap，不走 foreignKeyNames / foreignKeyColumnNames
  // 两个平行数组按下标配对：那种写法一旦两边长度不等就会把值写进相邻的列，且完全无声。
  // 列名直接从关系上取，配对关系由数据结构本身保证。
  // 三个字段在 EntityMetadata 上都是必填，故不加 `??` / `?.` —— 真为空是元数据装配的
  // bug，让它当场炸，别伪装成「这个实体没有外键」。
  for (const [key, relation] of metadata.foreignKeyRelationMap) {
    if (!(key in entity)) continue;

    // 不检查 relation.readonly：关系不会带这个键。`relation-types.interface.ts` 里所有
    // 关系选项都声明了 `readonly?: never`，类型层就不让声明；`EntityManager.init()` 又会
    // 用 metadata-validate 的 readonlyOnRelation 规则，把任何带 readonly 键的关系当场拒绝
    // 注册。能跑到这里的 relation 必然已经过了那道校验，不用在业务代码里再防一次。
    const { columnName } = relation as { columnName?: string };
    if (!columnName) {
      throw new RxDBError(`${metadata.namespace}:${metadata.name} 的外键关系 '${key}' 缺少 columnName`);
    }
    result[columnName] = entity[key];
  }

  return result;
};

/**
 * 规范化创建数据（过滤未赋值字段）。
 *
 * @param metadata - 实体元数据
 * @param entity - 待写入的实体实例或数据对象
 * @returns 以数据库列名为键的待写入字段
 *
 * @throws {@link RxDBError} 外键关系缺少 `columnName` 时
 *
 * @remarks
 * 与 {@link normalizeUpdateEntity} 是同一件事的两侧，两点**故意**不同：
 *
 * 1. **不过滤 `readonly`。** 主键、`createdAt` 这类列正是 readonly 的，照更新侧的口径过滤会让
 *    每一行都缺主键。readonly 的执行点在更新边界，不在创建边界。
 * 2. **按「值不为 `undefined`」判定，不按 `key in entity`。** `target: es2025` 下
 *    `useDefineForClassFields` 默认开启，`updatedAt!: Date` 这行字段声明本身就会在实例上装出一个
 *    值为 `undefined` 的自有属性，键恒在。按键判定等于把「没赋值」也写进 INSERT，适配器再把
 *    `undefined` 归一成 `null`——建表时那句 `DEFAULT now()` 于是永远不生效，NOT NULL + DEFAULT
 *    的列直接报约束错。显式的 `null` 照常写：「没给值」与「就是要清空」是两件事。
 *
 * 外键**走 keyed 的 `foreignKeyRelationMap`，不走 `foreignKeyNames` / `foreignKeyColumnNames`
 * 两个平行数组按下标配对**：那种写法一旦两边长度不等就会把 A 的值写进 B 的列，且完全无声。
 * 列名直接从关系上取，配对关系由数据结构本身保证。三个字段在 `EntityMetadata` 上都是必填，
 * 故不加 `??` / `?.`——真为空是元数据装配的 bug，让它当场炸，别伪装成「这个实体没有外键」。
 *
 * SQLite 家族与 PGlite 两个适配器都在创建边界调用本函数；`createdBy` / `updatedBy` 等审计字段
 * 在此之后由 adapter 按物理列名单独注入。
 */
export const normalizeCreateEntity = (metadata: EntityMetadata, entity: object): EntityData => {
  const result: EntityData = {};

  for (const [key, property] of metadata.propertyMap) {
    const value = Reflect.get(entity, key);
    if (value !== undefined) {
      result[property.columnName] = value;
    }
  }

  for (const [key, relation] of metadata.foreignKeyRelationMap) {
    const value = Reflect.get(entity, key);
    if (value === undefined) continue;

    // 同样不检查 relation.readonly——关系不可能带这个键，理由见
    // normalizeUpdateEntity 对应位置的注释。
    const { columnName } = relation as { columnName?: string };
    if (!columnName) {
      throw new RxDBError(`${metadata.namespace}:${metadata.name} 的外键关系 '${key}' 缺少 columnName`);
    }
    result[columnName] = value;
  }

  return result;
};

/**
 * 获取需要保存的实体
 * @param entities
 * @returns
 */
export const getNeedSaveEntities = <T extends EntityType>(entities: InstanceType<T>[]) => {
  const entitySet = new Set<InstanceType<T>>();
  // 递归查找所有需要保存的实体
  const _deep_find_entity = (entity: InstanceType<T>) => {
    const status = getEntityStatus(entity);
    const needSave = status.getNeedSaveEntities();
    if (needSave.length) _deep_find_entities(needSave);
  };
  const _deep_find_entities = (es: InstanceType<T>[]) =>
    es.forEach(e => {
      if (entitySet.has(e)) return;
      entitySet.add(e);
      _deep_find_entity(e);
    });
  _deep_find_entities(entities);
  return Array.from(entitySet).filter(entity => getEntityStatus(entity).modified);
};

/**
 * 获取需要删除的实体
 * 从根实体开始递归查找所有需要删除的关联实体
 * 注意：根实体本身不会被加入删除列表，只收集它们的关系中标记为删除的实体
 *
 * @param entities - 根实体数组（查找起点）
 * @returns 需要删除的实体数组（只包含 local=true 的）
 */
export const getNeedRemoveEntities = <T extends EntityType>(entities: InstanceType<T>[]) => {
  // 收集到的是**关系另一侧**的实体（多对多的 Junction），类型与根实体 `T` 无关。
  // 从前写 `Set<InstanceType<T>>` 只是看着精确：它恒等于 `Set<any>`，把这处错配一并吞了。
  const entitySet = new Set<EntityInstanceType<EntityType>>();

  // 递归查找单个实体的需要删除的关联实体
  const _deep_find_entity = (entity: EntityInstanceType<EntityType>) => {
    const status = getEntityStatus(entity);
    const foundEntities = status.getNeedRemoveEntities();
    foundEntities.forEach(e => {
      if (!entitySet.has(e)) {
        entitySet.add(e);
        _deep_find_entity(e);
      }
    });
  };

  // 从根实体开始递归，但不把根实体本身加入删除集合
  entities.forEach(entity => _deep_find_entity(entity));

  // 只返回 local=true 的实体（已存在于数据库）
  return Array.from(entitySet).filter(entity => getEntityStatus(entity).local);
};

/**
 * {@link getEntityMutations} 的入参
 *
 * @remarks
 * 此前它既不导出、字段又是 snake_case：`getEntityMutations` 本身在公开面上，
 * 于是包外要么照抄一份结构、要么被迫写 `Parameters<typeof getEntityMutations>[0]`
 * 才能给这个对象起名——本轮把类型一并转出，字段也改成与仓内其余接口一致的 camelCase。
 *
 * @typeParam T - 根实体类型
 */
export interface EntityMutationsOptions<T extends EntityType = EntityType> {
  /** 待写入（新增或更新由各自的 {@link getEntityStatus} 判定）的实体 */
  needSaveEntities: InstanceType<T>[];
  /**
   * 待删除的实体
   *
   * @remarks
   * 与 {@link getNeedRemoveEntities} 同源：装的是关系另一侧的 Junction，不是根实体 `T`。
   */
  needRemoveEntities: EntityInstanceType<EntityType>[];
}

/**
 * 获取实体变更映射
 * @param options
 * @returns
 */
export const getEntityMutations = <T extends EntityType = EntityType>(
  options: EntityMutationsOptions<T>
): RxDBMutationsMap<T> => {
  const { needSaveEntities, needRemoveEntities } = options;
  const need_create_entities_map = new Map<T, Set<InstanceType<T>>>();
  const need_update_entities_map = new Map<T, Set<InstanceType<T>>>();
  const need_delete_entities_map = new Map<T, Set<InstanceType<T>>>();

  const addToGroup = (map: Map<T, Set<InstanceType<T>>>, key: T, entity: InstanceType<T>) => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(entity);
  };

  for (const entity of needSaveEntities) {
    const status = getEntityStatus(entity);
    const ctor = entity.constructor as T;
    addToGroup(status.local ? need_update_entities_map : need_create_entities_map, ctor, entity);
  }

  for (const entity of needRemoveEntities) {
    const status = getEntityStatus(entity);
    if (status.local) {
      // 删除桶装的是**关系另一侧**的实体（Junction），构造器与根实体 `T` 无关——所以 key 一直要断言成 `T`。
      // 值也是同一回事：`RxDBMutationsMap.remove` 现在写着 `Set<InstanceType<T>>`，只因为
      // `InstanceType<EntityType>` 恒等于 `any`，才把这处错配一路吞到了适配器层。
      // 把 `remove` 的元素类型改对要连带改动全部适配器的 `mutations()` 实现，不在本轮范围内。
      addToGroup(need_delete_entities_map, entity.constructor as T, entity as InstanceType<T>);
    }
  }

  return {
    create: need_create_entities_map,
    remove: need_delete_entities_map,
    update: need_update_entities_map
  };
};
