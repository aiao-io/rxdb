/**
 * @fileoverview 授权快照的落库行（US-029）：随身份的本地库走，离线重开沿用上次取到的快照。
 */

import { SYSTEM_ENTITY_PERMISSIONS } from '../entity/entity-permissions.js';
import { Entity } from '../entity/entity.decorator.js';
import { PropertyType } from '../entity/metadata-options.interface.js';

/** 授权快照那一行的主键：一个库只有一份快照 */
export const RXDB_GRANT_STATE_ID = 'current' as const;

/**
 * 授权快照的落库行：单行，主键恒为 {@link RXDB_GRANT_STATE_ID}
 *
 * @remarks
 * 「未取到」就是没有这一行；「已取到、一项授权都没有」是 `grants` 为空数组的一行，两者不能混。
 * 一个库属于一个身份（US-035），换身份就是换库，快照不跨库。
 *
 * 不写变更日志（`log: false`）：它是远端授权的本机缓存，不进历史、不推送、不参与撤销。
 * 内容的形状由 `RxDBGrants` 读回时校验，读不懂的行按「未取到」处理（判定 fail-closed），下一次设入或刷新覆盖它。
 *
 * 新库随建表建出它；本功能之前建的库由 `connect()` 的系统表补建建出，不升系统 schema 版本。
 */
@Entity({
  namespace: 'rxdb',
  name: 'RxDBGrantState',
  tableName: 'rxdb_grant_state',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'source', type: PropertyType.string },
    { name: 'grants', type: PropertyType.json },
    { name: 'updatedAt', type: PropertyType.date, default: () => new Date() }
  ]
})
export class RxDBGrantState {
  /** 恒为 {@link RXDB_GRANT_STATE_ID} */
  id!: string;
  /** 快照来源（`RxDBGrantSource`），读回时校验 */
  source!: string;
  /** 规范化后的授权（`RxDBGrant[]`），读回时校验 */
  grants!: unknown;
  /** 取得时间 */
  updatedAt!: Date;
}
