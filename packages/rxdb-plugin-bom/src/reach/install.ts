import { buildReachCycleDdl } from './cycle-ddl.js';
import { buildReachMaintenanceDdl } from './reach-ddl.js';

/** 本地判环与可达维护的全部存储层 DDL；判环是唯一实现，与维护同事务接入。 */
export const buildReachInstallDdl = (adapterName: string): string[] => [
  ...buildReachCycleDdl(adapterName),
  ...buildReachMaintenanceDdl(adapterName)
];
