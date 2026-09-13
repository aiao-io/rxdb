/**
 * @fileoverview `CommitCapabilityState` 实体定义（data-model.md §2.1）
 *
 * 数据库级「提交能力」开关与版本协商的唯一真相。单行表，主键取常量。
 */

import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

/**
 * `rxdb_commit_capability` 的单行主键常量。
 *
 * @remarks
 * 主键取常量即单行守卫——第二行插不进来，不需要额外的「只允许一行」触发器。
 */
export const COMMIT_CAPABILITY_STATE_ID = 'default';

/**
 * 提交能力协议版本
 *
 * @remarks
 * 描述的是**命令层协议**——`commit` / `restore` / `discard` / `switchBranch` 这组入口的
 * 参数与 CAS 语义。它与 {@link COMMIT_GRAPH_SCHEMA_VERSION}（图的物理形状）、
 * `RXDB_CHANGE_CODEC_VERSION`（patch 的编解码）分三个号，是因为三者会各自独立演进：
 * 只加一个可选入参不动表结构时，只有本号该 +1。合成一个号意味着任何一处变动都把
 * 另外两处的既有库判成不兼容。
 */
export const COMMIT_PROTOCOL_VERSION = 1;

/**
 * 提交图结构版本
 *
 * @remarks
 * 与 `RXDB_SYSTEM_SCHEMA_VERSION` **不是**同一个号：后者覆盖 RxDB 全部系统表，
 * 任何一张系统表的形状变动都会推高它；本号只跟着提交图自己的物理形状走。
 */
export const COMMIT_GRAPH_SCHEMA_VERSION = 1;

/**
 * 数据库级提交能力状态（单行）
 *
 * @remarks
 * - **启用是一次 CAS**：`UPDATE … SET enabled = true WHERE id = 'default' AND enabled = false`。
 *   重复启用命中 0 行 = 幂等，不报错、不重置版本字段。
 * - 启用后 `protocolVersion` / `schemaVersion` / `codecVersion` 只读；每个 writer 连接时读本行
 *   与进程常量比对，任一不匹配按既有 `UnsupportedRxDBSystemVersionError` 语义 fail-closed。
 * - `enabled = false` 时全部捕获与门禁短路，对应 FR-046 的**零行为差异**。
 *
 * @see {@link COMMIT_CAPABILITY_STATE_ID}
 */
@Entity({
  namespace: 'rxdb',
  name: 'CommitCapabilityState',
  tableName: 'rxdb_commit_capability',
  // 本表自身的写入若被 change trigger 记录，会与「写工作树条目」互相递归
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true
    },
    {
      name: 'enabled',
      type: PropertyType.boolean,
      default: false
    },
    {
      name: 'protocolVersion',
      type: PropertyType.integer
    },
    {
      name: 'schemaVersion',
      type: PropertyType.integer
    },
    {
      name: 'codecVersion',
      type: PropertyType.integer
    },
    {
      name: 'enabledAt',
      type: PropertyType.date,
      nullable: true
    }
  ]
})
export class CommitCapabilityState {
  /**
   * 主键，恒为 {@link COMMIT_CAPABILITY_STATE_ID}
   */
  id!: string;

  /**
   * 数据库级显式启用开关
   *
   * @remarks
   * 未启用时全部提交/工作树能力短路，库行为与 v3 完全一致。
   */
  enabled!: boolean;

  /**
   * 提交能力协议版本
   */
  protocolVersion!: number;

  /**
   * commit 图结构版本
   */
  schemaVersion!: number;

  /**
   * 与 `RXDB_CHANGE_CODEC_VERSION` 对齐的编解码版本
   *
   * @remarks
   * 不一致时按既有 `UnsupportedRxDBSystemVersionError` 口径拒绝，**不做降级读取**。
   */
  codecVersion!: number;

  /**
   * 启用时刻；未启用时为 `null`
   */
  enabledAt!: Date | null;
}
