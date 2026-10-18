import type { TransactionExecutor } from '@aiao/rxdb';
import { buildReachCycleDdl } from './cycle-ddl.js';
import { buildReachMaintenanceDdl } from './reach-ddl.js';

/** 在源约束安装完成后接入同事务的可达性维护。 */
export const installReachMaintenance = async (executor: TransactionExecutor, adapterName: string): Promise<void> => {
  for (const statement of [...buildReachCycleDdl(adapterName), ...buildReachMaintenanceDdl(adapterName)])
    await executor.query(statement);
};
