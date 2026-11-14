import type { Routes } from '@angular/router';
import { BOM_WORKSPACE_CONFIG, type BomWorkspaceConfig } from './config';
import { BomDomainHost } from './domain-host';
import { BomDemoService } from './app/bom-demo.service';
import { BomWorkspaceState } from './app/bom-workspace-state';
import { appRoutes } from './app/app.routes';

export const domainRoutes = (config: BomWorkspaceConfig): Routes => [{
  path: '', component: BomDomainHost,
  providers: [BomDemoService, BomWorkspaceState, { provide: BOM_WORKSPACE_CONFIG, useValue: config }],
  children: appRoutes.map(route => route.path === '' ? { ...route, path: config.overviewPath.slice(1) } : route)
}];
