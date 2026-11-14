import { describe, expect, it } from 'vitest';
import { BomDemoService } from './app/bom-demo.service';
import { BomWorkspaceState } from './app/bom-workspace-state';
import { BOM_WORKSPACE_CONFIG } from './config';
import { createBomDatabase } from './database';
import { domainRoutes } from './domain-routes';
describe('领域入口装配', () => {
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
  it('每个领域路由拥有自己的服务与状态，概览路径随应用变化', async () => {
    const config = { databaseName: 'new-bom', overviewPath: '/domain', workbenchPath: '/', label: '新 BOM' };
    const [route] = domainRoutes(config);
    expect(route.providers).toContain(BomDemoService);
    expect(route.providers).toContain(BomWorkspaceState);
    expect(route.providers).toContainEqual({ provide: BOM_WORKSPACE_CONFIG, useValue: config });
    const paths = route.children!.map(child => child.path);
    expect(paths).toEqual([
      'domain',
      'review',
      'explosion',
      'timeline',
      'mapping',
      'cost',
      'where-used',
      'instances',
      'transfer',
      '**'
    ]);
    for (const child of route.children!) if (child.loadComponent) expect(await child.loadComponent()).toBeDefined();
  });
});
