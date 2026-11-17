import type { Routes } from '@angular/router';
import { appRoutes } from './app/app.routes';
import { BomDemoService } from './app/bom-demo.service';
import { BomWorkspaceState } from './app/bom-workspace-state';
import { BOM_WORKSPACE_CONFIG, type BomWorkspaceConfig } from './config';
import { BomDomainHost } from './domain-host';

export const domainRoutes = (config: BomWorkspaceConfig): Routes => {
  const children: Routes = [];
  if (config.workbenchRoute) children.push(config.workbenchRoute);
  for (const route of appRoutes) {
    if (route.path === '**') continue;
    if (route.path === '') children.push({ ...route, path: config.overviewPath.slice(1) });
    else children.push(route);
  }
  // 旧深链兼容：/domain 客户端重定向到概览。redirectTo 不携带 query params，属可接受取舍。
  children.push({ path: 'domain', redirectTo: config.overviewPath });
  children.push({ path: '**', redirectTo: config.overviewPath });
  return [
    {
      path: '',
      component: BomDomainHost,
      providers: [BomDemoService, BomWorkspaceState, { provide: BOM_WORKSPACE_CONFIG, useValue: config }],
      children
    }
  ];
};
