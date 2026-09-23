import type { EntityType } from '@aiao/rxdb';
import { cloneEntityClasses as coreCloneEntityClasses } from '@aiao/rxdb/testing';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';
import {
  adapterConstructionSuite,
  bigintBinaryClientSuite,
  bigintBinaryEntitySuite,
  cascadeMutationSuite,
  cloneEntityClasses,
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
} from '../testing.js';

const suiteExports = [
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
  sqliteRepositorySuite,
  rxdbAdapterSuite,
  sqliteClientBatchTimeoutSuite,
  sqliteClientSuite,
  systemSchemaMigrationSuite,
  tableIndexSuite,
  transactionSqliteResultSuite,
  treeIntegrationSuite,
  undoRedoSuite,
  versionBranchSuite
];

describe('testing subpath', () => {
  it('keeps the published testing export on executable dist entries', () => {
    expect(packageJson.exports).toHaveProperty('./testing');
    // `@aiao/source` 是构建期条件（US-601）：Node 的运行时解析器不认识这个条件名，
    // 因此它指向 `.ts` 不影响下面三条运行时条件仍然落在可执行的 dist 产物上。
    // 它的用途是让 api-surface.mjs 从一处真相源找到本子路径的源入口并纳入 API 基线。
    expect(Reflect.get(packageJson.exports, './testing')).toEqual({
      '@aiao/source': './src/testing.ts',
      types: './dist/testing.d.ts',
      import: './dist/testing.js',
      default: './dist/testing.js'
    });
  });

  it('declares the shared-suite dependency as an optional peer, not a runtime dependency', () => {
    // 这条断言的前身要求 `@aiao/rxdb-test` 必须在 `dependencies` 里。它想守的性质是对的：
    // `dist/testing.js` 顶层静态 import 了它，只放 devDependencies 会让已发布的
    // `./testing` 在消费者侧解析失败。但主入口 `dist/index.js` **一处都不引用它**，
    // 放进 dependencies 的代价是每个只 `import '@aiao/rxdb-adapter-sqlite-core'` 的
    // 生产应用都白装一整个测试库。
    //
    // 可选 peer 同时满足两边，也与同包 `vitest` 的既有处理完全一致 —— `vitest` 同样
    // 只被 `./testing` 用到。本断言是这条约定唯一的守卫：tarball 层的 production
    // 场景验证随手工发布改造一并移除了。
    expect(packageJson.dependencies).not.toHaveProperty('@aiao/rxdb-test');
    expect(packageJson.peerDependencies).toHaveProperty('@aiao/rxdb-test', 'workspace:*');
    expect(packageJson.peerDependenciesMeta).toHaveProperty('@aiao/rxdb-test.optional', true);
    // 本地 build / typecheck 仍要解析得到它。
    expect(packageJson.devDependencies).toHaveProperty('@aiao/rxdb-test', 'workspace:*');
  });

  it('exports every shared suite as a function', () => {
    expect(suiteExports).toHaveLength(21);
    for (const suite of suiteExports) expect(suite).toBeTypeOf('function');
  });

  it('clones entity classes without reusing constructors', () => {
    class First {}
    class Second {}
    const entities: EntityType[] = [First, Second];

    const clones = cloneEntityClasses(entities);

    expect(clones).toHaveLength(entities.length);
    expect(clones[0]).not.toBe(First);
    expect(clones[1]).not.toBe(Second);
    expect(Object.getPrototypeOf(clones[0])).toBe(First);
    expect(Object.getPrototypeOf(clones[1])).toBe(Second);
  });

  it('cloneEntityClasses 是核心 @aiao/rxdb/testing 那一份，不是本包的副本', () => {
    // 元数据槽位的查找、原型链上溯、非对象值、ɵ 槽位跳过这几条判据全部归核心的
    // `src/__tests__/testing/clone-entity-classes.spec.ts`。本包这一侧只剩"是不是同一个函数"——
    // 抄一遍不会红任何断言（两份内容一开始总是一致的），只有引用相等断得出来。
    expect(cloneEntityClasses).toBe(coreCloneEntityClasses);
  });
});
