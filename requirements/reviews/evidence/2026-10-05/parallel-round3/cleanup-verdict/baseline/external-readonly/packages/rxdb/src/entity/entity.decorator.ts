/**
 * @fileoverview Entity 装饰器实现
 *
 * `@Entity(...)` 是 RxDB 唯一的"激活"入口 —— 没经过它装饰的类**不能**
 * 用 `new` 创建、不能保存、也不会出现在 `RxDB.init()` 的扫描结果里。
 *
 * 装饰器在编译期做的几件事：
 *
 * 1. 把入参 `metadataOptions` 沿原型链合并成 `EntityMetadata` 并挂到类构造器上
 *    （见 {@link transitionMetadata}）；
 * 2. 抽象实体（`abstract: true`）**不**生成子类化包装，直接返回原 target；
 * 3. 非抽象实体用 `extends EntityClass` 的子类改写构造函数，顺序是
 *    `super(initData)` → 填充默认值 → 填充初始值 → 包成 Proxy 抛出。
 *
 * 第 3 步的顺序不可调换：默认值是"字段没填时给一个"，初始值是"用户传啥就
 * 用啥覆盖默认值"，代理必须在字段完全确定之后再包，否则代理拿到的就是
 * 半成品对象。
 */

import { RxDBError } from '../RxDBError.js';
import { ENTITY_MANAGER, EntityManagerPrivate, METADATA, PROXY } from '../rxdb.private.js';
import { AbstractEntityType, EntityType } from './entity.interface.js';
import { fillDefaultValue, fillInitValue, setSafeObjectKey } from './entity.utils.js';
import { EntityMetadataOptions } from './metadata-options.interface.js';
import { transitionMetadata } from './metadata-transition.js';

/**
 * 实体装饰器
 * 用于将类标记为 RxDB 实体，并处理元数据、代理和生命周期
 *
 * 该装饰器会：
 * 1. 转换并存储实体元数据
 * 2. 处理实体的默认值和初始值
 * 3. 为实体创建代理，以支持变更跟踪和关系管理
 * 4. 处理抽象实体和具体实体的不同行为
 *
 * @example
 * ```typescript
 * // 基本用法
 * @Entity({ name: 'User' })
 * class User extends EntityBase {}
 * ```
 *
 * @param metadataOptions - 实体元数据选项，包含名称、显示名称、属性、关系、索引等配置
 * @returns 类装饰器函数
 */
export const Entity =
  (metadataOptions: EntityMetadataOptions) =>
  <T extends EntityType | AbstractEntityType>(target: T): T => {
    // 转换 metadata
    const metadata = transitionMetadata(metadataOptions, target);
    // 设置 metadata
    setSafeObjectKey(target, METADATA, metadata);
    // 如果是抽象实体，直接返回目标类
    if (metadataOptions.abstract) return target;
    // 创建继承自目标类的新类
    const EntityClass = target as unknown as new (...args: unknown[]) => object;
    /**
     * 增强的实体类
     * 扩展原始实体类，添加默认值处理、初始值填充和代理包装功能
     * 保持原始类的所有属性和方法，同时增强其构造函数行为
     */
    return class extends EntityClass {
      /**
       * 实体构造函数
       * 处理实体初始化、默认值填充和代理包装
       *
       * 构造函数执行以下步骤：
       * 1. 调用原始类的构造函数
       * 2. 获取实体管理器
       * 3. 填充默认值（基于元数据中定义的默认值）
       * 4. 填充初始值（如果提供了初始化数据）
       * 5. 创建并返回实体代理（用于变更跟踪）
       */
      constructor(initData?: Partial<InstanceType<T>>) {
        super(initData);
        // 获取实体管理器
        const em = (this as unknown as { [ENTITY_MANAGER]: EntityManagerPrivate })[ENTITY_MANAGER];
        if (!em) throw new RxDBError('need init rxdb');
        // 填充默认值
        fillDefaultValue(metadata, this);
        // 填充初始值
        if (initData) fillInitValue(metadata, this, initData);
        // 返回实体代理
        return em[PROXY](this);
      }
    } as unknown as T;
  };
