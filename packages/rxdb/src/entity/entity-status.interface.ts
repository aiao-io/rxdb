/**
 * @fileoverview 实体状态管理模块
 * 提供实体状态跟踪、变更记录和关系管理功能
 */

import { EntityType } from './entity.interface.js';

/**
 * 实体变化记录接口
 * 记录实体的变更信息，包括变更内容、逆向变更、时间戳等
 *
 * @interface
 * @template T 实体类型
 */
export interface EntityPatch<T extends EntityType> {
  /**
   * 变化
   */
  patch: Partial<InstanceType<T>> | null;

  /**
   * 逆变化
   */
  inversePatch: Partial<InstanceType<T>> | null;

  /**
   * 记录的毫秒世界时间
   */
  recordAt: Date;

  /**
   * 记录的程序开始的时间
   * 用于 recordAt 一样的时候排序用
   */
  timeStamp: DOMHighResTimeStamp;
}

/**
 * 实体状态接口
 * 定义实体状态的基本属性和行为
 */
export interface IEntityStatus<T extends EntityType> {
  /**
   * 当前实体
   */
  target: InstanceType<EntityType>;

  /**
   * 是否已修改
   */
  modified?: boolean;

  /**
   * 是否在本地
   */
  local?: boolean;

  /**
   * 是否在远程
   */
  remote?: boolean;

  /**
   * 实体数据变化
   */
  patches?: EntityPatch<T>[];
}

/**
 * 实体状态选项类型
 * 用于创建实体状态实例时的配置选项
 */
export type EntityStatusOptions<T extends EntityType> = Omit<IEntityStatus<T>, 'target' | 'proxyTarget'>;
