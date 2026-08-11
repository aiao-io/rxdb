/**
 * @fileoverview 实体工具函数
 * 提供实体操作的通用工具函数
 */

import { isFunction } from '@aiao/utils';
import { RxDBMutationsMap } from '../rxdb-adapter.js';
import { getEntityStatus } from '../rxdb-utils.js';
import { EntityData, EntityType } from './entity.interface.js';
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
 * 给实体实例填充默认值
 * 根据元数据中定义的默认值，为实体的未赋值属性设置默认值
 *
 * @template T - 实体类型
 * @param metadata - 实体元数据
 * @param entity - 实体实例
 */
export const fillDefaultValue = <T extends EntityType>(metadata: EntityMetadata, entity: InstanceType<T>) => {
  const data: Record<string, unknown> = {};
  let need = false;
  metadata.defaultValueProperties.forEach(property => {
    if (entity[property.name] === undefined) {
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

  const foreignKeyNames = metadata.foreignKeyNames ?? [];
  const foreignKeyColumnNames = metadata.foreignKeyColumnNames ?? foreignKeyNames;
  for (let index = 0; index < foreignKeyNames.length; index++) {
    const key = foreignKeyNames[index];
    if (!(key in entity)) continue;

    const relation = metadata.foreignKeyRelationMap?.get(key);
    if (relation && (!('readonly' in relation) || relation.readonly !== true)) {
      result[foreignKeyColumnNames[index]] = entity[key];
    }
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
  const entitySet = new Set<InstanceType<T>>();

  // 递归查找单个实体的需要删除的关联实体
  const _deep_find_entity = (entity: InstanceType<T>) => {
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
  need_remove_entities: InstanceType<T>[];
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
      addToGroup(need_delete_entities_map, entity.constructor as T, entity);
    }
  }

  return {
    create: need_create_entities_map,
    remove: need_delete_entities_map,
    update: need_update_entities_map
  };
};
