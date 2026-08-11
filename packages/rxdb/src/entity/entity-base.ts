/**
 * @fileoverview 实体基类定义文件
 *
 * 所有 RxDB 实体必须继承的"形状契约"基类。它承担三件事：
 *
 * 1. **统一基础字段**（`id` / `createdAt` / `updatedAt` / `createdBy` / `updatedBy`）
 *    —— 这五个字段在每个实体上都有，由基类的元数据预先声明，业务子类不用再写。
 * 2. **挂静态方法签名**（`get` / `findOne` / `find` 等 `declare static`）——
 *    它们**没有**运行时实现，由 {@link RepositoryBase} 在 `EntityManager.init()`
 *    时按 `staticMethods` 名单注入到子类上。`declare` 是为了让 TypeScript 把签名
 *    当作类自身成员而不需要实现体。
 * 3. **挂实例方法签名**（`save` / `remove` / `reset`）—— 同上，由
 *    {@link EntityStatus} 在代理层注入。
 *
 * 这里**不**放任何业务逻辑：dirty tracking、关系缓存、change 合并全部走
 * 代理 + Status 槽位，基类保持"零代码"才能让继承链稳定。
 */

import { Observable } from 'rxjs';
import type {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { uuid } from '../rxdb-utils.js';
import { Entity } from './entity.decorator.js';
import { IEntity, RxDBEntityId, UUID } from './entity.interface.js';
import { EntityMetadataOptions, PropertyType } from './metadata-options.interface.js';

export const ENTITY_BASE_METADATA_OPTIONS: EntityMetadataOptions = {
  name: 'EntityBase',
  abstract: true, // 标记为抽象类，不会直接创建此类的实例
  properties: [
    {
      name: 'id',
      displayName: 'ID',
      type: PropertyType.uuid,
      primary: true, // 主键
      unique: true, // 唯一索引
      readonly: true, // 创建后不可修改
      default: () => uuid() // 默认生成 UUID
    },
    {
      name: 'createdAt',
      displayName: '创建时间',
      type: PropertyType.date,
      readonly: true,
      default: () => new Date()
    },
    {
      name: 'updatedAt',
      displayName: '更新时间',
      type: PropertyType.date,
      readonly: true,
      default: () => new Date()
    },
    {
      name: 'createdBy',
      displayName: '创建者',
      type: PropertyType.string,
      readonly: true,
      nullable: true
    },
    {
      name: 'updatedBy',
      displayName: '更新者',
      type: PropertyType.string,
      readonly: true,
      nullable: true
    }
  ]
} as const;

/**
 * 实体基类装饰器配置
 * 定义了所有实体共有的基础属性
 */
@Entity(ENTITY_BASE_METADATA_OPTIONS)
/**
 * 实体基类
 * 所有需要同步的实体都应该继承此类
 *
 * 提供通用的实体属性，如ID、创建时间、更新时间等
 * 自动处理这些字段的默认值和只读属性
 *
 * @example
 * ```typescript
 * @Entity({ name: 'User' })
 * class User extends EntityBase {
 * }
 * ```
 *
 * @implements {IEntity} 实现实体接口
 */
export abstract class EntityBase<Id extends RxDBEntityId = UUID> implements IEntity {
  /**
   * 实体唯一标识符
   * 自动生成的UUID，作为主键
   */
  readonly id!: Id;

  /**
   * 创建时间
   * 实体创建时自动设置为当前时间
   */
  readonly createdAt!: Date;

  /**
   * 更新时间
   * 实体创建或更新时自动设置为当前时间
   */
  readonly updatedAt!: Date;

  /**
   * 创建者ID
   * 记录创建此实体的用户ID
   */
  readonly createdBy?: UUID | null;

  /**
   * 更新者ID
   * 记录最后更新此实体的用户ID
   */
  readonly updatedBy?: UUID | null;

  /**
   * 根据 id 获取实体
   * @param id - 实体的唯一标识符
   * @returns Observable 包装的实体实例
   */
  declare static get: <T extends EntityBase<RxDBEntityId>>(this: new () => T, id: T['id']) => Observable<T>;

  /**
   * 查找一个实体
   * @param options - 查询选项，包含 where 条件
   * @returns Observable 包装的实体实例或 null
   */
  declare static findOne: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindOneOptions<new () => T>
  ) => Observable<T | null>;

  /**
   * 查找一个实体，查不到就抛出错误
   * @param options - 查询选项，包含 where 条件
   * @returns Observable 包装的实体实例
   */
  declare static findOneOrFail: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindOneOrFailOptions<new () => T>
  ) => Observable<T>;

  /**
   * 查询多个实体
   * @param options - 查询选项，包含 where 条件、limit、offset 等
   * @returns Observable 包装的实体实例数组
   */
  declare static find: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindOptions<new () => T>
  ) => Observable<T[]>;

  /**
   * 查询所有实体
   * @param options - 查询选项，包含 where 条件和排序（不限制数量）
   * @returns Observable 包装的实体实例数组
   */
  declare static findAll: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindAllOptions<new () => T>
  ) => Observable<T[]>;

  /**
   * 通过游标进行分页查询
   * @param options - 游标分页选项，包含 orderBy、before/after 游标
   * @returns Observable 包装的实体实例数组
   */
  declare static findByCursor: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: FindByCursorOptions<new () => T>
  ) => Observable<T[]>;

  /**
   * 查询实体数量
   * @param options - 查询选项，包含 where 条件
   * @returns Observable 包装的数量
   */
  declare static count: <T extends EntityBase<RxDBEntityId>>(
    this: new () => T,
    options: CountOptions<new () => T>
  ) => Observable<number>;

  /**
   * 删除
   */
  declare remove: () => Promise<this>;
  /**
   * 重置数据
   */
  declare reset: () => void;
  /**
   * 保存
   */
  declare save: () => Promise<this>;

  /**
   * 实体基类构造函数
   * 子类会通过 Entity 装饰器增强此构造函数
   *
   * @param _initData - 可选的初始化数据
   */
  constructor(initData?: unknown) {
    void initData;
  }
}
