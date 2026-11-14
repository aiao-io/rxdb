import { InjectionToken } from '@angular/core';

export interface DomainImportEnvelope {
  name: string;
  datasetId: string;
  rootItemNo: string;
  revisionNo: string;
  orgId: string;
  records: Record<string, unknown>[];
  identities: { key: string; sourceRef: string; parentItemNo: string; lineNo: number }[];
}
export interface BomWorkspaceConfig {
  databaseName: string;
  overviewPath: string;
  workbenchPath: string | null;
  label: string;
  readPending?: () => Promise<DomainImportEnvelope | undefined>;
  completePending?: (envelope: DomainImportEnvelope) => Promise<void>;
}
export const BOM_WORKSPACE_CONFIG = new InjectionToken<BomWorkspaceConfig>('BOM_WORKSPACE_CONFIG', {
  providedIn: 'root',
  factory: () => ({ databaseName: 'dev-rxdb-bom', overviewPath: '/', workbenchPath: null, label: 'BOM 演示中心' })
});
