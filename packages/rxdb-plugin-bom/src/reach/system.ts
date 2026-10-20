import type { EntityType, RxDB, RxDBSystemContribution } from '@aiao/rxdb';
import { BOM_GRAPH_ENTITIES, BomReach } from './entities.js';
import { assertReachComplete, createReachMigration } from './migration.js';

const noWork = (): Promise<void> => Promise.resolve();

const adapterName = (db: RxDB): string => {
  const name = db.config.sync?.local?.adapter;
  if (name === undefined) throw new Error('[rxdb-plugin-bom] 可达性需要明确的本地适配器');
  return name;
};

/**
 * 图源实体齐全才接入可达性迁移与图维护。
 *
 * @remarks
 * 不含发生项的部分配置（如只配物料/修订主数据）没有并集边，不需要图维护且照常可用；
 * 含发生项却缺图源实体的配置不合法，由插件 install 期的依赖校验在任何 DDL 之前拒绝，
 * 两后端同一时点失败。因此配置合法时本判定等价于「配置了发生项」。
 */
export const hasCompleteBomGraph = (db: RxDB): boolean => {
  const entities: readonly EntityType[] = db.config.entities;
  return BOM_GRAPH_ENTITIES.every(Entity => entities.includes(Entity));
};

/** 在建表前贡献内部实体，并将旧库回填交给已有原子迁移机制。 */
export const createBomReachSystem = (db: RxDB): RxDBSystemContribution => ({
  capability: 'bom',
  version: 1,
  packageSpecifier: '@aiao/rxdb-plugin-bom',
  entities: [BomReach],
  createInitialRows: () => [],
  createMigrations: () => (hasCompleteBomGraph(db) ? [createReachMigration(adapterName(db))] : []),
  bootstrapExisting: async ({ adapter }) => {
    if (hasCompleteBomGraph(db))
      await adapter.bootstrapTransaction(executor => assertReachComplete(executor, adapterName(db)), false);
  },
  writeBranchRows: noWork,
  removeBranchRows: noWork,
  prepareBranchSwitch: noWork,
  takeOverBranchSwitch: () => Promise.resolve('not_applicable'),
  settleBranchSwitchFailure: noWork
});
