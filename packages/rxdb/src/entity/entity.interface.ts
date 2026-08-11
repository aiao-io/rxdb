/**
 * @fileoverview 实体接口定义文件
 *
 * 本文件集中定义 RxDB 实体的**类型层契约**，是整个实体子模块（装饰器、状态机、
 * 元数据、代理、关系缓存等）的根。设计要点：
 *
 * - **`EntityType` = 类构造器 + 静态类型槽**：通过 `IEntityStaticType[ENTITY_STATIC_TYPES]`
 *   把"静态方法的类型声明"和"可实例化的构造器"绑成同一个类型，
 *   于是 `User.findOne(...)` 这类调用既能保留方法签名又能正确推断 `T`。
 * - **派生 vs 声明双源**：`EntityStaticType<T, K>` 同时支持"用户显式声明的静态类型"
 *   和"从 `InstanceType<T>` 自动派生的查询选项"。前者优先级更高，未声明的键
 *   （`findOptions` / `countOptions` 等）则由 `DerivedEntityStaticType` 兜底。
 * - **关系访问抽象**：`RelationEntityObservable` / `RelationEntitiesObservable`
 *   把 `set/remove` / `add/remove/count$` 这些"既要监听又要操作"的能力
 *   封进同一个 `Observable` 子类里，省掉一对独立 API。
 *
 * 整个包的代码生成器（`@aiao/rxdb-client-generator`）也会读这里导出的形状，
 * 类型层字段不能轻易改名或重排。
 */

import { Observable } from 'rxjs';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { ITreeEntity } from './tree-entity.interface.js';

export const ENTITY_STATIC_TYPES: unique symbol = Symbol('ɵEntityStaticTypes');

/**
 * 实体的静态类型
 *
 * @remarks
 * 仅作"可挂在类构造器上的形状"的最小承诺。**没有**运行时字段：
 * `ENTITY_STATIC_TYPES` 是 `unique symbol` 而非字符串键，类型推导时只取
 * `StaticTypes` 这个泛型参数，编译后不会变成可枚举的 own property。
 *
 * 实际把"声明的静态类型"挂到类上的操作由 {@link transitionMetadata} 的
 * 反向引用（`ENTITY_TYPE` 槽位）完成；本接口只承担类型合并的角色。
 */
export interface IEntityStaticType<StaticTypes extends object = object> {
  [ENTITY_STATIC_TYPES]?: StaticTypes;
}

type DeclaredEntityStaticType<T extends IEntityStaticType, K extends PropertyKey> =
  T extends { [ENTITY_STATIC_TYPES]: infer StaticTypes extends object } ?
    K extends keyof StaticTypes ?
      StaticTypes[K]
    : never
  : never;

/**
 * RxDB 实体主键的公共运行时类型。
 *
 * `bigint` 主键必须位于有符号 64 位范围内，并仅由支持该类型的本地 adapter
 * 持久化。binary 不允许作为主键。
 */
export type RxDBEntityId = string | number | bigint;

type DerivedEntityId<T extends EntityType> = Exclude<(InstanceType<T> & { id?: RxDBEntityId })['id'], undefined>;

type DerivedEntityStaticType<T extends EntityType, K extends PropertyKey> =
  K extends 'idType' | 'getOptions' ? DerivedEntityId<T>
  : K extends 'findOneOrFailOptions' ? FindOneOrFailOptions<T, object>
  : K extends 'findOptions' ? FindOptions<T, object>
  : K extends 'findOneOptions' ? FindOneOptions<T, object>
  : K extends 'findAllOptions' ? FindAllOptions<T, object>
  : K extends 'findByCursorOptions' ? FindByCursorOptions<T, object>
  : K extends 'countOptions' ? CountOptions<T, object>
  : never;

type EntityStaticTypeSource<T extends EntityType, K extends PropertyKey> =
  T extends { [ENTITY_STATIC_TYPES]: infer StaticTypes extends object } ?
    K extends keyof StaticTypes ?
      'declared'
    : 'derived'
  : 'derived';

type EntityStaticTypeBySource<T extends EntityType, K extends PropertyKey> = {
  declared: DeclaredEntityStaticType<T, K>;
  derived: DerivedEntityStaticType<T, K>;
};

export type EntityStaticType<T extends EntityType, K extends PropertyKey> = EntityStaticTypeBySource<
  T,
  K
>[EntityStaticTypeSource<T, K>];

/**
 * 实体类型
 *
 * 表示可实例化的实体构造函数类型 —— 既是"可以 `new` 出来的类"，也携带
 * 通过 `ENTITY_STATIC_TYPES` 声明的静态方法签名。
 *
 * @typeParam StaticTypes - 类侧的静态方法类型声明（如 `findOptions` / `idType`），
 *   缺省 `object` 表示走 {@link DerivedEntityStaticType} 的自动派生路径。
 * @typeParam Instance - `new` 出来的实例形状，仅在适配器做条件类型推断时有用。
 *
 * @remarks
 * `new (...args: never[])` 是有意写成的：实体的实际构造函数签名由
 * {@link Entity} 装饰器在编译期**重写**成 `(initData?)`，
 * 公开类型层不暴露形参是为了防止调用方依赖"特定参数会被装填"这种隐式契约。
 */
export type EntityType<
  StaticTypes extends object = object,
  Instance extends object = object
> = IEntityStaticType<StaticTypes> & (new (...args: never[]) => Instance);

/**
 * 实体数据类型
 *
 * 通用的键值对数据对象 —— 仅用于 {@link Rule} / `RuleGroup` 等不限定
 * 具体实体形状的场景；任何与实体属性耦合的字段声明都应当走
 * {@link EntityStaticType} 的派生路径，而不是用 `EntityData` 把"具体字段名"
 * 抹平。
 */
export type EntityData = Record<string, unknown>;

/**
 * 实体基础类型
 *
 * 表示"继承自 {@link EntityBase} 的所有实体类"的公共形状；
 * 主要给 {@link rxdb-adapter} 内部的工厂在拿不到具体实体类、又必须构造
 * `IRepository` 时使用。绝大多数业务代码应直接用 {@link EntityType}。
 */
export type EntityBaseType = IEntityStaticType & (new (...args: never[]) => IEntity);

/**
 * 树形实体类型
 *
 * 继承了 {@link IEntity} 的 `id` / `createdAt` 等字段，再加上
 * `parentId` 与 `hasChildren` 这类树形独有属性。
 * {@link TreeRepository} 据此提供 `findDescendants` / `countAncestors` 等方法。
 */
export type TreeEntityType = IEntityStaticType & (new (...args: never[]) => ITreeEntity);

/**
 * 抽象实体类型
 *
 * 只能被 `@Entity({ abstract: true })` 装饰的类。它**不会**触发
 * {@link Entity} 装饰器的子类化（运行时没有 `new`），所以常见于
 * `EntityBase` / `TreeAdjacencyListEntityBase` 这类只供继承的基类。
 */
export type AbstractEntityType = abstract new (...args: never[]) => object;

/**
 * 实体基础接口
 * 定义所有实体共有的基本属性，为了能更好地与远程数据同步
 * 所有实体类都应该实现这个接口
 */
export interface IEntity {
  /**
   * id
   */
  id: RxDBEntityId;

  /**
   * 创建时间
   */
  createdAt: Date;

  /**
   * 更新时间
   */
  updatedAt: Date;

  /**
   * 创建人
   */
  createdBy?: string | null;

  /**
   * 更新人
   */
  updatedBy?: string | null;
}

/**
 * UUID类型
 * 表示标准的UUID字符串格式
 * 格式为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;

/**
 * 单个关系对象的访问接口
 * 提供对单个关联实体的观察和操作能力
 */
export interface RelationEntityObservable<T extends EntityType> extends Observable<InstanceType<T> | null> {
  /**
   * 设置关联实体
   *
   * @param entity - 要设置的实体或 null（解除关联）
   */
  set: (entity: InstanceType<T> | null) => void;

  /**
   * 移除关联实体
   * 相当于设置为null
   */
  remove: () => void;
}

/**
 * 多个关系对象的访问接口
 * 提供对多个关联实体集合的观察和操作能力
 */
export interface RelationEntitiesObservable<T extends EntityType> extends Observable<InstanceType<T>[]> {
  /**
   * 关联实体数量的可观察对象
   */
  count$: Observable<number>;

  /**
   * 添加关联实体
   *
   * @param entities - 要添加的实体列表
   */
  add: (...entities: InstanceType<T>[]) => void;

  /**
   * 移除关联实体
   *
   * @param entities - 要移除的实体列表
   */
  remove: (...entities: InstanceType<T>[]) => void;
}

/**
 * 实体更新数据类型
 * 用于表示更新实体时传递的数据结构
 */
export type EntityUpdateData<T extends EntityType> = Omit<Partial<InstanceType<T>>, 'id'> & {
  id: EntityStaticType<T, 'idType'>;
};
