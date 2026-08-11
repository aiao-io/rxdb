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

  it('declares shared suites as a published runtime dependency', () => {
    expect(packageJson.dependencies).toHaveProperty('@aiao/rxdb-test', 'workspace:*');
    expect(packageJson.devDependencies).not.toHaveProperty('@aiao/rxdb-test');
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
