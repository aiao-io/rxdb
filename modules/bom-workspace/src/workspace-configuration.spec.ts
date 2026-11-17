import { describe, expect, it } from 'vitest';
import { BomDemoService } from './app/bom-demo.service';
import { BomWorkspaceState } from './app/bom-workspace-state';
import { BOM_WORKSPACE_CONFIG } from './config';
import { createBomDatabase } from './database';
import { domainRoutes } from './domain-routes';

class WorkbenchStub {}

describe('统一外壳装配', () => {
  it('真实 adapter 采用指定库名与本地 WASM，关闭 Worker 以使用完整备份合同', async () => {
    const database = createBomDatabase('isolated-config-test');
    const adapter = await database.getAdapter('wa-sqlite');
    expect(database.config.dbName).toMatch(/^isolated-config-test@/);
    expect(adapter.options).toMatchObject({
      vfs: 'IDBBatchAtomicVFS',
      worker: false,
      async: true,
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
    });
    expect(adapter.options.sharedWorker).toBeUndefined();
  });

  it('每个 BOM 路由拥有自己的服务与状态，工作台与概览按配置铺平', async () => {
    const config = {
      databaseName: 'new-bom',
      overviewPath: '/bom',
      workbenchPath: '/',
      label: '新 BOM',
      workbenchRoute: {
        path: '',
        pathMatch: 'full' as const,
        loadComponent: () => Promise.resolve(WorkbenchStub)
      }
    };
    const [route] = domainRoutes(config);
    expect(route.providers).toContain(BomDemoService);
    expect(route.providers).toContain(BomWorkspaceState);
    expect(route.providers).toContainEqual({ provide: BOM_WORKSPACE_CONFIG, useValue: config });
    const paths = route.children!.map(child => child.path);
    expect(paths).toEqual([
      '',
      'bom',
      'review',
      'explosion',
      'timeline',
      'mapping',
      'cost',
      'where-used',
      'instances',
      'transfer',
      'domain',
      '**'
    ]);
    expect(route.children!.find(child => child.path === '')!.pathMatch).toBe('full');
    expect(route.children!.find(child => child.path === 'domain')!.redirectTo).toBe(config.overviewPath);
    expect(route.children!.find(child => child.path === '**')!.redirectTo).toBe(config.overviewPath);
    for (const child of route.children!) if (child.loadComponent) expect(await child.loadComponent()).toBeDefined();
  });

  it('未提供工作台路由时保持原有子路由形态，未知路径重定向概览', async () => {
    const config = { databaseName: 'new-bom', overviewPath: '/bom', workbenchPath: null, label: '新 BOM' };
    const [route] = domainRoutes(config);
    const paths = route.children!.map(child => child.path);
    expect(paths).toEqual([
      'bom',
      'review',
      'explosion',
      'timeline',
      'mapping',
      'cost',
      'where-used',
      'instances',
      'transfer',
      'domain',
      '**'
    ]);
    expect(route.children!.find(child => child.path === 'domain')!.redirectTo).toBe('/bom');
    expect(route.children!.find(child => child.path === '**')!.redirectTo).toBe('/bom');
  });
});
