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
});
