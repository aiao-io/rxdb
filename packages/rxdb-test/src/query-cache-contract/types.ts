/**
 * @fileoverview QueryCache 行契约跨后端套件的接入点类型。
 */
import type { EntityMetadata } from '@aiao/rxdb';

/**
 * 一个后端对 QueryCache 行契约的实现。
 *
 * @remarks
 * 刻意不要求两个后端共用同一个函数或同一个错误类：必填列的判据来自**各自的建表 DDL**，
 * 而两者在 uuid 主键的数据库端默认值、`SET NULL` 外键列的 NOT NULL 上确有分歧。
 * 本套件钉的是**契约语义与消息骨架**一致，不是实现同一。
 */
export interface QueryCacheRowContractImpl {
  /** 后端名，进 `describe` 标题 */
  readonly name: string;
  /** 算出「远端行必须自带」的列：属性名（或关系名）→ 物理列名 */
  readonly requiredQueryCacheColumns: (metadata: EntityMetadata) => ReadonlyMap<string, string>;
  /** 落地前校验；不合契约时抛 {@link QueryCacheRowContractImpl.ErrorClass} */
  readonly assertQueryCacheRowContract: (entityName: string, rows: readonly object[], metadata: EntityMetadata) => void;
  /** 该后端的契约错误类 */
  readonly ErrorClass: new (message: string) => Error;
}
