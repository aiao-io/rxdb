import type { EntityType, RxDB, RxDBSystemContribution } from '@aiao/rxdb';
import { BomHeader, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { BomReach } from './entities.js';
import { assertReachComplete, createReachMigration } from './migration.js';

const noWork = (): Promise<void> => Promise.resolve();

const adapterName = (db: RxDB): string => {
  const name = db.config.sync?.local?.adapter;
  if (name === undefined) throw new Error('[rxdb-plugin-bom] 可达性需要明确的本地适配器');
  return name;
};

/** 只有完整的图实体配置才接入图维护，部分主数据配置仍保持可用。 */
export const hasCompleteBomGraph = (db: RxDB): boolean => {
  const entities: readonly EntityType[] = db.config.entities;
  return [BomItemRevision, BomHeader, BomLine, BomLineOccurrence].every(Entity => entities.includes(Entity));
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
