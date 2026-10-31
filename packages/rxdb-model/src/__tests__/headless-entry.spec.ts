import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as headless from '../headless.js';

describe('@aiao/rxdb-model/headless entry', () => {
  it('在 Node 环境导入时不初始化 DOM 或 VTable', () => {
    expect(typeof document).toBe('undefined');
    expect(headless.createEntityFormController).toBeTypeOf('function');
    expect(headless.createQueryBuilderController).toBeTypeOf('function');
    expect(headless.createEntityListController).toBeTypeOf('function');
    expect(headless.createEntityDetailController).toBeTypeOf('function');
    expect(headless.createEntityDialogController).toBeTypeOf('function');
    expect(headless.createQueryTableController).toBeTypeOf('function');
  });

  it('包 manifest 将 VTable 声明为可选 peer 并发布独立子路径', () => {
    const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports?: Record<string, unknown>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(packageJson.exports?.['./headless']).toBeDefined();
    expect(packageJson.peerDependenciesMeta?.['@visactor/vtable']?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta?.['@visactor/vtable-editors']?.optional).toBe(true);
  });

  it('三端 headless 子路径映射到可执行构建产物，Angular secondary entry 使用包根配置', () => {
    const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
    type Manifest = {
      exports?: Record<string, string | Record<string, string>>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      lib?: { entryFile?: string };
    };
    const readManifest = (relativePath: string): Manifest =>
      JSON.parse(readFileSync(resolve(workspaceRoot, relativePath), 'utf8')) as Manifest;
    const assertHeadlessExport = (relativePath: string): void => {
      const manifest = readManifest(relativePath);
      const entry = manifest.exports?.['./headless'];
      expect(entry).toBeDefined();
      expect(typeof entry).toBe('object');
      if (!entry || typeof entry === 'string') return;
      expect(entry['@aiao/source']).toMatch(/\.ts$/);
      expect(entry.types).toMatch(/\.d\.ts$/);
      expect(entry.import ?? entry.default).toMatch(/\.js$/);
      expect(manifest.peerDependenciesMeta?.['@visactor/vtable']?.optional).toBe(true);
    };

    assertHeadlessExport('packages/rxdb-model/package.json');
    assertHeadlessExport('packages/rxdb-model-react/package.json');
    assertHeadlessExport('packages/rxdb-model-vue/package.json');

    const angularManifest = readManifest('packages/rxdb-model-angular/package.json');
    expect(angularManifest.exports?.['.']).toBeUndefined();
    const angularHeadless = angularManifest.exports?.['./headless'];
    expect(typeof angularHeadless).toBe('object');
    if (!angularHeadless || typeof angularHeadless === 'string') return;
    expect(angularHeadless['@aiao/source']).toBe('./src/headless/public-api.ts');
    expect(readManifest('packages/rxdb-model-angular/headless/ng-package.json').lib?.entryFile).toBe(
      '../src/headless/public-api.ts'
    );
    expect(() =>
      readFileSync(resolve(workspaceRoot, 'packages/rxdb-model-angular/src/headless/package.json'))
    ).toThrow();
    expect(() =>
      readFileSync(resolve(workspaceRoot, 'packages/rxdb-model-angular/src/headless/ng-package.json'))
    ).toThrow();
  });
});
