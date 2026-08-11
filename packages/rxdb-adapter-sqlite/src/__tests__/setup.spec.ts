import {
  adapterConstructionSuite,
  bigintBinaryClientSuite,
  bigintBinaryEntitySuite,
  cascadeMutationSuite,
  createSqliteClientSuite,
  crudIntegrationSuite,
  customPrimaryKeySuite,
  joinSqlSuite,
  menuIntegrationSuite,
  querySqlSuite,
  relationIntegrationSuite,
  rxdbAdapterSuite,
  sqliteClientBatchTimeoutSuite,
  sqliteClientSuite,
  sqliteRepositorySuite,
  systemSchemaMigrationSuite,
  tableIndexSuite,
  transactionSqliteResultSuite,
  treeIntegrationSuite,
  undoRedoSuite,
  versionBranchSuite
} from '@aiao/rxdb-adapter-sqlite-core/testing';
import { sqliteOfficialFactory } from './sqlite-official-factory.js';

adapterConstructionSuite(sqliteOfficialFactory);
bigintBinaryClientSuite(sqliteOfficialFactory);
bigintBinaryEntitySuite(sqliteOfficialFactory);

rxdbAdapterSuite(sqliteOfficialFactory);
sqliteRepositorySuite(sqliteOfficialFactory);
systemSchemaMigrationSuite(sqliteOfficialFactory);
sqliteClientSuite(sqliteOfficialFactory);
sqliteClientBatchTimeoutSuite(sqliteOfficialFactory);
createSqliteClientSuite(sqliteOfficialFactory);

joinSqlSuite(sqliteOfficialFactory);
querySqlSuite(sqliteOfficialFactory);
tableIndexSuite(sqliteOfficialFactory);
transactionSqliteResultSuite(sqliteOfficialFactory);

crudIntegrationSuite(sqliteOfficialFactory);
customPrimaryKeySuite(sqliteOfficialFactory);
relationIntegrationSuite(sqliteOfficialFactory);
menuIntegrationSuite(sqliteOfficialFactory);
cascadeMutationSuite(sqliteOfficialFactory);
treeIntegrationSuite(sqliteOfficialFactory);

versionBranchSuite(sqliteOfficialFactory);
undoRedoSuite(sqliteOfficialFactory);
