/**
 * @fileoverview 只读检出位建快照用的适配器原语形状（US-313）。
 *
 * @remarks
 * 快照库与主库是同一种后端，行在两边都是这个后端的存储形态，加密列保持信封。所以页里的行
 * 不规定形状，只在同一种适配器之间传递；核心只规定怎么分页、怎么交接。
 *
 * 不复用 `mergeChanges`：它先解密再加密、要密钥已解锁、按变更日志编码再编码一次，
 * 还会读回每一行进实体缓存并派发事件。快照只要原样搬运。
 */

import type { EntityType } from './entity/entity.interface.js';
import type { SwitchVersionActions } from './sync-contract/VersionManager.interface.js';

/**
 * 分页游标：上一页最后一行的位置。
 *
 * @remarks
 * 形状由后端定（SQLite 系是 rowid，PGlite 是主键），调用方只把它原样传回去。
 */
export type WorktreeSnapshotCursor = string | number;

/** 一页存储形态的行。 */
export interface WorktreeSnapshotPage {
  /** 本页的行；形状只有读出它的那种适配器认得 */
  readonly rows: unknown;
  /** 本页行数 */
  readonly count: number;
  /** 下一页从哪接着读；`null` 即这张表已读完 */
  readonly next: WorktreeSnapshotCursor | null;
}

/** 一张要复制进快照库的表。 */
export interface WorktreeSnapshotTable {
  /** 快照实例上的实体类：与主实例的实体同命名空间、同名 */
  readonly EntityType: EntityType;
  /** 主库读出的页，按读出的顺序 */
  readonly pages: AsyncIterable<WorktreeSnapshotPage>;
}

/** 一次快照导入：复制的表，与叠在复制出来的行上的增量。 */
export interface WorktreeSnapshotImport {
  /** 要复制的表 */
  readonly tables: readonly WorktreeSnapshotTable[];
  /**
   * 从主库当前 active 分支走到目标点的增量。
   *
   * @remarks
   * 补丁是变更日志里的存储形态，加密列是信封；只含快照实例上有的实体。
   */
  readonly actions: SwitchVersionActions;
}
