import { InjectionToken } from '@angular/core';
import type { Route } from '@angular/router';

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
  /** 可选的结构工作台子路由，宿主应用传入时挂到统一外壳下。 */
  workbenchRoute?: Route;
}
export const BOM_WORKSPACE_CONFIG = new InjectionToken<BomWorkspaceConfig>('BOM_WORKSPACE_CONFIG');
