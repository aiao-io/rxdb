import type { EntityType } from '@aiao/rxdb';
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
    expect(Reflect.get(packageJson.exports, './testing')).toEqual({
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
    expect(suiteExports).toHaveLength(22);
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

  it('克隆时应该为 ɵMetadata 符号创建原型链副本', () => {
    const metadataSymbol = Symbol('ɵMetadata');
    const metadataValue = { name: 'WithMeta' };
    class WithMeta {}
    Object.defineProperty(WithMeta, metadataSymbol, { value: metadataValue, configurable: true });

    const [clone] = cloneEntityClasses([WithMeta as unknown as EntityType]);
    const cloned: unknown = Object.getOwnPropertyDescriptor(clone, metadataSymbol)?.value;

    expect(cloned).not.toBe(metadataValue);
    expect(Object.getPrototypeOf(cloned)).toBe(metadataValue);
  });

  it('应该沿原型链向上查找父类的 ɵMetadata 符号', () => {
    const metadataSymbol = Symbol('ɵMetadata');
    const metadataValue = { name: 'Base' };
    class Base {}
    Object.defineProperty(Base, metadataSymbol, { value: metadataValue, configurable: true });
    class Child extends Base {}

    const [clone] = cloneEntityClasses([Child as unknown as EntityType]);
    const cloned: unknown = Object.getOwnPropertyDescriptor(clone, metadataSymbol)?.value;

    expect(Object.getPrototypeOf(cloned)).toBe(metadataValue);
  });

  it('ɵMetadata 符号值非对象时应该视为无元数据', () => {
    const numberSymbol = Symbol('ɵMetadata');
    class WithNumberMeta {}
    Object.defineProperty(WithNumberMeta, numberSymbol, { value: 42, configurable: true });

    const nullSymbol = Symbol('ɵMetadata');
    class WithNullMeta {}
    Object.defineProperty(WithNullMeta, nullSymbol, { value: null, configurable: true });

    const [cloneNumber, cloneNull] = cloneEntityClasses([
      WithNumberMeta as unknown as EntityType,
      WithNullMeta as unknown as EntityType
    ]);

    expect(Object.getOwnPropertyDescriptor(cloneNumber, numberSymbol)).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(cloneNull, nullSymbol)).toBeUndefined();
  });

  it('克隆时应该复制静态属性并跳过 ɵ 前缀符号', () => {
    const metadataSymbol = Symbol('ɵMetadata');
    const skippedSymbol = Symbol('ɵPrivate');
    const copiedSymbol = Symbol('shared');
    class Source {
      static config = { flag: true };
      static helper(): string {
        return 'helper';
      }
    }
    Object.defineProperty(Source, metadataSymbol, { value: { name: 'Source' }, configurable: true });
    Object.defineProperty(Source, skippedSymbol, { value: 'skip-me', configurable: true });
    Object.defineProperty(Source, copiedSymbol, { value: 'copy-me', configurable: true });

    const [clone] = cloneEntityClasses([Source as unknown as EntityType]);

    expect((clone as unknown as typeof Source).helper()).toBe('helper');
    expect((clone as unknown as typeof Source).config).toBe(Source.config);
    expect(Object.getOwnPropertyDescriptor(clone, copiedSymbol)?.value).toBe('copy-me');
    expect(Object.getOwnPropertyDescriptor(clone, skippedSymbol)).toBeUndefined();
    // name / length / prototype 不应被覆盖
    expect(clone.name).not.toBe('');
    expect(clone.prototype).not.toBe(Source.prototype);
  });
});
