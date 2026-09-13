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
 * `key in entity` 取列），由建表时写下的 DB 端默认值补上；SQLite 的**批量** INSERT 是唯一的
 * 例外，它固定写全列、绕过了 DB DEFAULT，所以 `inserts_sql` 自己把哨兵解析成真实时间戳——
 * 那段代码此前是死的（它只在列缺省时才跑，而本函数总是先把字符串填满）。三条路径都已就位。
 */
export const fillDefaultValue = <T extends EntityType>(metadata: EntityMetadata, entity: InstanceType<T>) => {
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
      data[property.name] = property.type === PropertyType.binary ? new Uint8Array(value as Uint8Array) : value;
    }
  });
  if (need) Object.assign(entity, data);
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
    if ('readonly' in relation && relation.readonly === true) continue;

    const { columnName } = relation as { columnName?: string };
    if (!columnName) {
      throw new RxDBError(`${metadata.namespace}:${metadata.name} 的外键关系 '${key}' 缺少 columnName`);
    }
    result[columnName] = entity[key];
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

interface EntityMutationsOptions<T extends EntityType = EntityType> {
  need_save_entities: InstanceType<T>[];
  // 与 {@link getNeedRemoveEntities} 同源：装的是关系另一侧的 Junction，不是根实体 `T`。
  need_remove_entities: EntityInstanceType<EntityType>[];
}

/**
 * 获取实体变更映射
 * @param options
 * @returns
 */
export const getEntityMutations = <T extends EntityType = EntityType>(
  options: EntityMutationsOptions<T>
): RxDBMutationsMap<T> => {
  const { need_save_entities, need_remove_entities } = options;
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

  for (const entity of need_save_entities) {
    const status = getEntityStatus(entity);
    const ctor = entity.constructor as T;
    addToGroup(status.local ? need_update_entities_map : need_create_entities_map, ctor, entity);
  }

  for (const entity of need_remove_entities) {
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
