/**
 * 后端存储的单类收敛（US-026 AC#13）。
 *
 * @remarks
 * 后端与前端共用 `@modules/recipes-domain` 的同一个 {@link Recipe} 类：装饰器上的
 * QueryCache + http 声明原样保留给前端，后端只靠 `RxDB` 实例的 `syncOverrides`
 * 换成 `None + local: pglite`。这里钉死三件事：仓储绑的是共享类、生效策略是纯本地、
 * 原声明不被实例覆盖改写——任何一条回退，都意味着第二个实体类又长了回来。
 */

import { getEntityMetadata, SyncType } from '@aiao/rxdb';
import * as domain from '@modules/recipes-domain';
import { Recipe } from '@modules/recipes-domain';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RxdbRecipeStore } from '../rxdb-store.ts';
import { createRxdbRecipeStore, SERVER_RECIPE_SYNC } from '../rxdb-store.ts';

let workdir: string;
let store: RxdbRecipeStore;

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'us026-store-'));
  store = await createRxdbRecipeStore(join(workdir, 'pglite'));
});

afterEach(async () => {
  await store.destroy();
  rmSync(workdir, { recursive: true, force: true });
});

describe('后端 Recipe 单类收敛', () => {
  it('仓储绑定共享的 Recipe 类，领域模块不再导出第二个实体类', () => {
    expect(store.repo.EntityType).toBe(Recipe);
    expect(Object.keys(domain)).not.toContain('ServerRecipe');
  });

  it('生效策略是实例覆盖的纯本地 pglite，不是装饰器上的 QueryCache', () => {
    expect(SERVER_RECIPE_SYNC).toEqual({ type: SyncType.None, local: { adapter: 'pglite' } });
    expect(store.rxdb.entitySync.resolve(Recipe)).toEqual(SERVER_RECIPE_SYNC);
    expect(store.rxdb.entitySync.resolveType(Recipe)).toBe('local');
  });

  it('实例覆盖不改写共享类的原声明', () => {
    expect(getEntityMetadata(Recipe).sync).toEqual({
      type: SyncType.QueryCache,
      local: { adapter: 'wa-sqlite', syncStaleTime: 0 },
      remote: { adapter: 'http' }
    });
  });
});
