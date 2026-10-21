/**
 * @fileoverview 元数据选项转换为实体元数据
 * 提供将EntityMetadataOptions转换为EntityMetadataType的功能
 * 处理实体继承、属性映射、关系映射和索引映射
 */

import { isArray, isFunction } from '@aiao/utils';
import { tryGetEntityMetadata } from '../rxdb-utils.js';
import { RxDBError } from '../RxDBError.js';
import { EntityCheckMetadata } from './check-constraint.js';
import { mergeEntityPermissions } from './entity-permissions.js';
import { AbstractEntityType, EntityType } from './entity.interface.js';
import { setSafeObjectKey, setSafeObjectKeyLazyInitOnce } from './entity.utils.js';
import { EntityExclusionMetadata } from './exclusion-constraint.js';
import type { EntityGeneratedColumnMetadataOptions } from './generated-column.js';
import metadata_cascade_default from './metadata-cascade-default.js';
import {
  EntityForeignKeyMetadata,
  EntityMetadataFeatures,
  EntityMetadataOptions,
  EntityPropertyMetadata,
  EntityRelationManyToManyMetadata,
  EntityRelationManyToOneMetadata,
  EntityRelationMetadata,
  EntityRelationMetadataOptions,
  EntityRelationOneToOneMetadata,
  RelationKind
} from './metadata-options.interface.js';
import { EntityIndexMetadata, EntityMetadata, EntityMetadataType } from './metadata.interface.js';

const has_column_name_relation = (
  relationMetadata: EntityRelationMetadata | EntityRelationMetadataOptions
): relationMetadata is
  EntityRelationOneToOneMetadata | EntityRelationManyToOneMetadata | EntityRelationManyToManyMetadata =>
  relationMetadata.kind !== RelationKind.ONE_TO_MANY;

/**
 * 判定值是否为可逐字段合并的普通对象
 *
 * 数组整体替换：`features.graph.properties` 这类列表逐元素合并没有意义，故显式排除。
 */
const is_mergeable_record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 合并 features：外层按特性名，内层按特性字段
 *
 * @param base - 较远祖先的 features
 * @param override - 较近一层（子类方向）的 features，同名字段覆盖 base
 * @returns 合并结果；两侧都没有值时返回 `undefined`
 *
 * @remarks
 * 只深两层：`tree` / `graph` 这类特性自身是扁平配置对象，再往里就是数组或标量。
 * 若外层整块替换，子类写一个 `{ tree: { hasChildren: false } }` 就会把祖先的
 * `tree.type` 一并抹掉 —— 而适配器生成 hasChildren 子查询要求 `type` 同时有值。
 */
const merge_features = (
  base: EntityMetadataFeatures | undefined,
  override: EntityMetadataFeatures | undefined
): EntityMetadataFeatures | undefined => {
  if (!base) return override;
  if (!override) return base;
  const merged: EntityMetadataFeatures = { ...base };
  for (const [name, value] of Object.entries(override)) {
    const inherited = merged[name];
    merged[name] = is_mergeable_record(inherited) && is_mergeable_record(value) ? { ...inherited, ...value } : value;
  }
  return merged;
};

/**
 * 沿原型链取最近一个**显式声明过**该键的值
 *
 * @param metadataOptionsArray - 「最远祖先在前、自身在最后」的元数据列表
 * @param key - 要回退查找的键
 * @returns 自身 → 最近祖先 → 更远祖先方向上第一个非 `undefined` 的值
 *
 * @remarks
 * 用 `!== undefined` 而不是真值判断：`log: false` 是有意义的声明（关掉变更日志），
 * 不能被更远祖先的 `true` 顶掉。
 */
const nearest_declared = <K extends 'repository' | 'sync' | 'log' | 'manualOrder'>(
  metadataOptionsArray: readonly EntityMetadataOptions[],
  key: K
): EntityMetadataOptions[K] => {
  for (let index = metadataOptionsArray.length - 1; index >= 0; index--) {
    const value = metadataOptionsArray[index][key];
    if (value !== undefined) return value;
  }
  return undefined;
};

const cloneGeneratedColumn = (value: unknown): EntityGeneratedColumnMetadataOptions => {
  if (!is_mergeable_record(value)) return value as EntityGeneratedColumnMetadataOptions;
  const expression: unknown = value['expression'];
  return {
    ...value,
    ...(is_mergeable_record(expression) ? { expression: { ...expression } } : {})
  } as unknown as EntityGeneratedColumnMetadataOptions;
};

const collectGeneratedColumns = (
  options: EntityMetadataOptions,
  columns: Map<string, EntityGeneratedColumnMetadataOptions>
): void => {
  if ('propertyMap' in options) {
    const parent = options as EntityMetadata;
    if (!(parent.generatedColumnMap instanceof Map)) throw new RxDBError('已规范化父元数据缺少 generatedColumnMap');
    parent.generatedColumnMap.forEach((column, name) => columns.set(name, cloneGeneratedColumn(column)));
    return;
  }
  const declared: unknown = options.generatedColumns;
  if (declared === undefined) return;
  if (!Array.isArray(declared)) {
    columns.set(`$generatedColumns:${options.name}`, cloneGeneratedColumn(declared));
    return;
  }
  const names = new Set<string>();
  declared.forEach((column: unknown, index: number) => {
    const name = is_mergeable_record(column) && typeof column['name'] === 'string' ? column['name'] : undefined;
    const field = name !== undefined && !names.has(name) ? name : `generatedColumns[${options.name}:${index}]`;
    if (name !== undefined) names.add(name);
    columns.set(field, cloneGeneratedColumn(column));
  });
};

/**
 * 将元数据选项(metadataOptions)转换为实体元数据(metadata)
 *
 * 该函数执行以下操作：
 * 1. 收集实体原型链上的所有元数据选项
 * 2. 创建属性映射、关系映射和索引映射
 * 3. 处理实体继承关系
 * 4. 设置显示名称、默认值属性、外键关系和外键名称
 * 5. 添加辅助方法如isForeignKey
 *
 * @param metadataOptions - 实体元数据选项，包含实体的基本配置
 * @param [options] - 可选的目标类，用于获取原型链上的元数据
 */
export const transitionMetadata = (
  metadataOptions: EntityMetadataOptions,
  options?: EntityType | AbstractEntityType | EntityMetadataOptions | EntityMetadataOptions[]
): EntityMetadata => {
  // 记录原型链上的所有 metadata
  const metadataOptionsArray: EntityMetadataOptions[] = [];
  // 添加当前 metadata
  metadataOptionsArray.push(metadataOptions);

  // 创建实体属性、关系和索引的映射
  const propertyMap = new Map<string, EntityPropertyMetadata>(); // 属性名到属性元数据的映射
  const computedPropertyMap = new Map<string, EntityPropertyMetadata>(); // 计算属性名到属性元数据的映射
  const relationMap = new Map<string, EntityRelationMetadata>(); // 关系名到关系元数据的映射
  const indexMap = new Map<string, EntityIndexMetadata>(); // 索引名到索引元数据的映射
  const generatedColumnMap = new Map<string, EntityGeneratedColumnMetadataOptions>();
  const foreignKeyMap = new Map<string, EntityForeignKeyMetadata>();
  const checkMap = new Map<string, EntityCheckMetadata>(); // 约束 name 到 CHECK 元数据的映射
  const exclusionMap = new Map<string, EntityExclusionMetadata>(); // 约束 name 到区间排他元数据的映射

  // 创建基础元数据对象，继承元数据选项的所有属性
  const metadata = { ...metadataOptions } as EntityMetadataType;
  // `repository` / `sync` / `log` / `features` 的取值在原型链收集之后统一处理，
  // 这里不能先兜底 —— 详见下方「实体级配置沿原型链继承」
  metadata.namespace = metadata.namespace || 'public';
  metadata.properties = metadata.properties || [];
  metadata.relations = metadata.relations || [];
  metadata.indexes = metadata.indexes || [];
  metadata.foreignKeys = metadata.foreignKeys || [];
  metadata.checks = metadata.checks || [];
  metadata.exclusions = metadata.exclusions || [];
  metadata.computedProperties = metadata.computedProperties || [];

  // 处理原型链，收集所有父类的元数据
  if (options) {
    if (isFunction(options)) {
      let proto = options;
      let proto_metadata: EntityMetadataOptions | EntityMetadata | undefined = metadataOptions;
      while (proto !== Object.prototype && proto_metadata) {
        proto = Object.getPrototypeOf(proto);
        proto_metadata = tryGetEntityMetadata(proto);
        if (proto_metadata) metadataOptionsArray.push(proto_metadata);
      }
    } else if (isArray(options)) {
      metadataOptionsArray.push(...options);
    } else {
      metadataOptionsArray.push(options as EntityMetadataOptions);
    }
    const extend_names = metadataOptionsArray.map(d => d.name);
    extend_names.shift();
    metadata.extends = extend_names;
  }
  metadata.extends = metadata.extends || [];

  if (!metadata.displayName) metadata.displayName = metadata.name;
  if (!metadata.tableName) metadata.tableName = metadata.name;

  // reverse() 是就地反转：这一行之后 metadataOptionsArray 恒为「最远祖先在前、自身在最后」，
  // 下面的属性合并与实体级配置继承都依赖这个顺序
  metadataOptionsArray.reverse();

  // 处理属性、关系和索引
  // 从父类到子类的顺序处理，子类的定义会覆盖父类的定义
  metadataOptionsArray.forEach(meta => {
    // 不可原地修改入参元数据：父类元数据在多个子类间共享，原地写会互相污染
    const namespace = meta.namespace || 'public';
    collectGeneratedColumns(meta, generatedColumnMap);
    // 处理属性
    meta.properties?.forEach(property => {
      const cloned = { ...property } as EntityPropertyMetadata;
      if (!cloned.columnName) cloned.columnName = cloned.name;
      propertyMap.set(cloned.name, cloned);
      // 属性级 check 语法糖：编译成以属性名为 name 的实体级 CHECK，同样参与按 name 的继承覆盖。
      // 排在实体级 checks 之前：同一层里作者显式写的 checks 覆盖语法糖。
      // 子实体重声明同一属性（不带 check）即摘除继承的语法糖——属性声明是「该属性的约束域」
      // 的完整重定义，保留父约束会让子类被迫继承一条自己已改列的 CHECK。
      if (property.check) {
        checkMap.set(property.name, {
          name: property.name,
          rule: { combinator: 'and', rules: [{ field: property.name, ...property.check }] }
        });
      } else {
        checkMap.delete(property.name);
      }
    });
    meta.computedProperties?.forEach(property => {
      const cloned = { ...property } as EntityPropertyMetadata;
      if (!cloned.columnName) cloned.columnName = cloned.name;
      computedPropertyMap.set(cloned.name, cloned);
    });

    // 处理关系
    meta.relations?.forEach(relation => {
      // 先克隆再处理，避免污染父类共享的关系定义
      const cloned = { ...relation } as EntityRelationMetadata;
      cloned.mappedNamespace = cloned.mappedNamespace || namespace;

      // 应用默认级联选项
      // 根据关系类型和nullable属性自动设置合理的默认级联行为
      // nullable 只存在于 ONE_TO_ONE 和 MANY_TO_ONE 关系中
      const nullable = 'nullable' in cloned ? (cloned.nullable ?? false) : false;
      const cascadeOptions = metadata_cascade_default(
        {
          onDelete: cloned.onDelete,
          onUpdate: cloned.onUpdate
        },
        cloned.kind,
        nullable
      );
      cloned.onDelete = cascadeOptions.onDelete;
      cloned.onUpdate = cascadeOptions.onUpdate;

      // 多对一和一对一关系需要在当前实体中存储外键
      if (has_column_name_relation(cloned) && !cloned.columnName) {
        cloned.columnName = cloned.name + 'Id';
      }

      // 处理继承的关系信息
      // 如果关系映射到自身，则需要更新为当前实体
      if (cloned.mappedEntity === meta.name && cloned.mappedNamespace === namespace) {
        // 更新映射实体为当前实体
        cloned.mappedEntity = metadata.name;
        // 关系的命名空间应该也改成当前实体的空间
        cloned.mappedNamespace = metadata.namespace;
      }
      relationMap.set(cloned.name, cloned);
    });
    // 处理索引
    meta.indexes?.forEach(d => {
      // `normalized` 只改写唯一性比较的口径，非唯一索引上它没有任何可执行语义。
      // 不静默忽略：这种拼写换来的是「以为加了约束、其实一行都拦不住」。
      if (d.normalized && !d.unique) {
        throw new Error(
          `实体 ${metadata.name} 的索引 ${d.name} 声明了 normalized 却没有 unique：normalized 只对唯一索引有意义`
        );
      }
      indexMap.set(d.name, d);
    });
    meta.foreignKeys?.forEach(foreignKey => {
      if (foreignKey.properties.length !== foreignKey.mappedProperties.length) {
        throw new Error(`实体 ${metadata.name} 的外键 ${foreignKey.name} 本地字段数与引用字段数不一致`);
      }
      foreignKeyMap.set(foreignKey.name, {
        ...foreignKey,
        mappedNamespace: foreignKey.mappedNamespace || namespace
      });
    });
    // 处理 CHECK：与 indexes / foreignKeys 同一套按 name 的 Map 覆盖——子实体同名项覆盖父实体的，
    // 异名项全部生效（US-030 AC#17）。
    // 与 indexes 同口径**不克隆**：畸形条目（缺 rule / rules）由注册期校验
    // `validateEntityMetadata` 以 `invalidCheck` 聚合上报，装饰期不做深层解包——解包会在
    // 模块加载阶段崩掉，而不是给出可定位的违规条目。
    meta.checks?.forEach(check => {
      checkMap.set(check.name, check);
    });
    // 处理区间排他：与 checks 同一套按 name 的 Map 覆盖、同样不克隆（畸形条目由注册期校验以
    // invalidExclusion 聚合上报）。
    meta.exclusions?.forEach(exclusion => {
      exclusionMap.set(exclusion.name, exclusion);
    });
  });

  // 实体级配置沿原型链继承
  // 这几项描述的是**整个实体的行为**，不是「自己定义的那几个字段」：属性 / 关系 / 索引
  // 早就沿原型链合并了，它们却只带自身声明的值 —— 结果是继承一个基类只继承到「形状」，
  // 继承不到「行为」（例如树插件的基类，它的 features.tree 与 repository 都传不下来）。
  const features = metadataOptionsArray.reduce<EntityMetadataFeatures | undefined>(
    (merged, meta) => merge_features(merged, meta.features),
    undefined
  );
  // 整条链都没有 features 时不写这个键，保持元数据形状不变
  if (features) metadata.features = features;
  const sync = nearest_declared(metadataOptionsArray, 'sync');
  if (sync !== undefined) metadata.sync = sync;
  const log = nearest_declared(metadataOptionsArray, 'log');
  if (log !== undefined) metadata.log = log;
  // `manualOrder: false` 同样是有意义的声明（子类关掉祖先的手动排序），同 log 用就近而非真值
  const manualOrder = nearest_declared(metadataOptionsArray, 'manualOrder');
  if (manualOrder !== undefined) metadata.manualOrder = manualOrder;
  // 按操作就近继承：整键覆盖会让子类只写 `{ delete: 'system' }` 时悄悄放开父类收紧的 update。
  // 整条链都没声明时同样不写这个键；非法值原样留给注册期校验
  const permissions = mergeEntityPermissions(metadataOptionsArray);
  if (permissions !== undefined) metadata.permissions = permissions as EntityMetadataType['permissions'];
  // 默认仓库名的兜底必须在继承**之后**：先定死成 'Repository'，
  // 祖先声明的门面名（如树插件的 'TreeRepository'）就再也传不下来
  metadata.repository = nearest_declared(metadataOptionsArray, 'repository') || 'Repository';

  // 将映射添加到元数据对象
  setSafeObjectKey(metadata, 'propertyMap', propertyMap); // 属性映射
  setSafeObjectKey(metadata, 'computedPropertyMap', computedPropertyMap); // 计算属性映射
  setSafeObjectKey(metadata, 'relationMap', relationMap); // 关系映射
  setSafeObjectKey(metadata, 'indexMap', indexMap); // 索引映射
  setSafeObjectKey(metadata, 'generatedColumnMap', generatedColumnMap);
  setSafeObjectKey(metadata, 'checkMap', checkMap); // CHECK 约束映射（继承合并后的全集）
  setSafeObjectKey(metadata, 'exclusionMap', exclusionMap); // 区间排他映射（继承合并后的全集）

  // 用规范化后的克隆对象回填「自身」数组（保持仅含本类定义的语义），
  // 避免直接引用未处理（无 columnName）的入参对象，同时不污染父类共享元数据
  metadata.properties = metadata.properties.map(p => propertyMap.get(p.name) as EntityPropertyMetadata);
  metadata.computedProperties = metadata.computedProperties.map(
    p => computedPropertyMap.get(p.name) as EntityPropertyMetadata
  );
  metadata.relations = metadata.relations.map(r => relationMap.get(r.name) as EntityRelationMetadata);
  metadata.foreignKeys = Array.from(foreignKeyMap.values());
  metadata.checks = metadata.checks.map(c => checkMap.get(c.name) as EntityCheckMetadata);
  metadata.exclusions = metadata.exclusions.map(e => exclusionMap.get(e.name) as EntityExclusionMetadata);
  if (Array.isArray(metadata.generatedColumns)) {
    metadata.generatedColumns = metadata.generatedColumns.map(column => cloneGeneratedColumn(column));
  }

  // 加密属性映射 (004-local-field-encryption)
  // 仅收集 encrypted: true 的属性；不在此处校验冲突，校验由
  // `@aiao/rxdb-adapter-encrypted` 在 adapter init 时进行，避免反向依赖。
  const encryptedPropertyMap = new Map<string, EntityPropertyMetadata>();
  propertyMap.forEach((property, name) => {
    if ((property as { encrypted?: boolean }).encrypted === true) {
      encryptedPropertyMap.set(name, property);
    }
  });
  setSafeObjectKey(metadata, 'encryptedPropertyMap', encryptedPropertyMap);

  // 创建列名到属性名的反向映射
  const columnNameToPropertyName = new Map<string, string>();
  propertyMap.forEach((property, name) => {
    columnNameToPropertyName.set(property.columnName, name);
  });
  setSafeObjectKey(metadata, 'columnNameToPropertyName', columnNameToPropertyName);

  // 设置有默认值的属性列表
  // 使用懒初始化，只在首次访问时计算
  setSafeObjectKeyLazyInitOnce(metadata, 'defaultValueProperties', () =>
    Array.from(propertyMap.values()).filter(property => property.default !== undefined)
  );

  // 设置外键关系列表
  // 多对一和一对一关系需要在当前实体中存储外键
  setSafeObjectKeyLazyInitOnce(metadata, 'foreignKeyRelations', () =>
    Array.from(metadata.relationMap.values()).filter(
      property => property.kind === RelationKind.MANY_TO_ONE || property.kind === RelationKind.ONE_TO_ONE
    )
  );
  setSafeObjectKeyLazyInitOnce(metadata, 'foreignKeyRelationMap', () => {
    const map = new Map<string, EntityRelationMetadata>();
    metadata.foreignKeyRelations.forEach(relation => map.set(`${relation.name}Id`, relation));
    return map;
  });

  // 设置外键属性名称列表
  // 外键名称通常是关系名称加上'Id'后缀（JS 属性名）
  setSafeObjectKeyLazyInitOnce(metadata, 'foreignKeyNames', () => metadata.foreignKeyRelations.map(d => `${d.name}Id`));

  // 设置外键列名列表（数据库列名）
  //
  // 与 `foreignKeyNames` **按下标一一对应**，所以这里只能 1:1 map，不能 filter：
  // 过滤掉任何一项都会让两个数组错位，`normalizeUpdateEntity` 就会把 A 的值写进 B 的列，
  // 无声写错数据。上面 `has_column_name_relation` 分支已保证 MANY_TO_ONE / ONE_TO_ONE
  // 一定有 columnName，真缺失就是元数据处理有 bug —— 抛错，别用过滤掩盖。
  setSafeObjectKeyLazyInitOnce(metadata, 'foreignKeyColumnNames', () =>
    metadata.foreignKeyRelations.map(d => {
      const { columnName } = d as EntityRelationManyToOneMetadata;
      if (!columnName) {
        throw new Error(`[RxDB] ${metadata.namespace}:${metadata.name} 的外键关系 '${d.name}' 缺少 columnName`);
      }
      return columnName;
    })
  );

  /**
   * 添加 isForeignKey 方法
   * 用于判断一个属性名是否为外键
   */
  setSafeObjectKey(
    metadata,
    'isForeignKey',
    (name: string) => name && name.endsWith('Id') && metadata.foreignKeyNames.includes(name)
  );

  return metadata;
};
