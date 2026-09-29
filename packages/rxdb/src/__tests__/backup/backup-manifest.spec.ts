/**
 * @fileoverview US-217 manifest 结构校验与兼容性判定（AC#5 / AC#13 / AC#14）。
 *
 * @remarks
 * 这一步发生在恢复写入目标**之前**，是「不兼容就不碰目标」的唯一闸门，所以每一项都要能单独
 * 触发、并在 `details.field` 里说清是哪一项。
 */

import { describe, expect, it } from 'vitest';
import { RxDBBackupError, type RxDBBackupErrorCode } from '../../backup/backup-error.js';
import { assertRxDBBackupCompatible, parseRxDBBackupManifest } from '../../backup/backup-manifest.js';
import type { RxDBBackupCompatibility } from '../../backup/backup.interface.js';
import { RXDB_BACKUP_SCOPE } from '../../backup/backup.interface.js';
import { sampleManifest } from './fixtures/archive.js';

const expectThrows = (fn: () => unknown, code: RxDBBackupErrorCode, field?: string) => {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(RxDBBackupError);
  expect((caught as RxDBBackupError).code).toBe(code);
  expect((caught as RxDBBackupError).details.field).toBe(field);
  return caught as RxDBBackupError;
};

const target = (overrides: Partial<RxDBBackupCompatibility> = {}): RxDBBackupCompatibility => ({
  adapterName: 'pglite',
  engine: 'postgres',
  engineCompatibility: 'postgres-17',
  extensions: ['vector', 'pg_trgm'],
  systemSchemaVersion: 6,
  changeCodecVersion: 1,
  schemaFingerprint: 'f'.repeat(64),
  authDomain: null,
  ...overrides
});

type Loose = Record<string, unknown>;

/**
 * 深拷贝样例 manifest，按点路径删除（`value` 省略）或改写一个字段。
 */
const edited = (path: string, ...value: [unknown?]): unknown => {
  const clone = structuredClone(sampleManifest()) as unknown as Loose;
  const segments = path.split('.');
  const last = segments.pop()!;
  const parent = segments.reduce<Loose>((node, key) => node[key] as Loose, clone);
  if (value.length === 0) delete parent[last];
  else parent[last] = value[0];
  return clone;
};

describe('parseRxDBBackupManifest', () => {
  it('合法 manifest 原样返回', () => {
    expect(parseRxDBBackupManifest(structuredClone(sampleManifest()))).toEqual(sampleManifest());
  });

  it('范围声明与冻结常量一致（AC#14）', () => {
    expect(sampleManifest().scope).toEqual(RXDB_BACKUP_SCOPE);
    expect(Object.isFrozen(RXDB_BACKUP_SCOPE)).toBe(true);
  });

  it.each([
    'format',
    'formatVersion',
    'createdAt',
    'scope',
    'scope.database',
    'scope.externalFiles',
    'adapter',
    'adapter.name',
    'adapter.engine',
    'adapter.engineVersion',
    'adapter.engineCompatibility',
    'adapter.extensions',
    'adapter.storage',
    'rxdb',
    'rxdb.version',
    'rxdb.systemSchemaVersion',
    'rxdb.changeCodecVersion',
    'schemaFingerprint',
    'encryption'
  ])('缺少 %s', path => {
    expectThrows(() => parseRxDBBackupManifest(edited(path)), 'incompatible_archive', path);
  });

  it.each<[string, string, unknown]>([
    ['format', 'format', 'tar'],
    ['formatVersion', 'formatVersion', 2],
    ['scope.database', 'scope.database', 'partial'],
    ['scope.externalFiles', 'scope.externalFiles', 'included'],
    ['adapter.extensions', 'adapter.extensions', ['ok', 3]],
    ['rxdb.systemSchemaVersion', 'rxdb.systemSchemaVersion', '6'],
    ['rxdb.changeCodecVersion', 'rxdb.changeCodecVersion', 1.5],
    ['schemaFingerprint', 'schemaFingerprint', 'not-hex'],
    ['encryption.authDomain', 'encryption', { authDomain: 1 }],
    ['createdAt', 'createdAt', 'yesterday']
  ])('%s 取值非法', (field, path, value) => {
    expectThrows(() => parseRxDBBackupManifest(edited(path, value)), 'incompatible_archive', field);
  });

  it.each([null, 'x', 1, []])('根不是对象：%j', value => {
    expectThrows(() => parseRxDBBackupManifest(value), 'incompatible_archive', 'manifest');
  });
});

describe('assertRxDBBackupCompatible', () => {
  it('完全一致时通过', () => {
    expect(() => assertRxDBBackupCompatible(sampleManifest(), target())).not.toThrow();
  });

  it('只记录不比较：RxDB 版本、引擎完整版本、源存储后端、创建时间', () => {
    const manifest = sampleManifest({
      rxdb: { version: '9.9.9', systemSchemaVersion: 6, changeCodecVersion: 1 },
      adapter: { ...sampleManifest().adapter, engineVersion: '17.9', storage: 'idb' },
      createdAt: '2000-01-01T00:00:00.000Z'
    });
    expect(() => assertRxDBBackupCompatible(manifest, target())).not.toThrow();
  });

  it.each<[string, Partial<RxDBBackupCompatibility>]>([
    ['adapter.name', { adapterName: 'sqlite' }],
    ['adapter.engine', { engine: 'sqlite' }],
    ['adapter.engineCompatibility', { engineCompatibility: 'postgres-18' }],
    ['adapter.extensions', { extensions: ['pg_trgm'] }],
    ['rxdb.systemSchemaVersion', { systemSchemaVersion: 7 }],
    ['rxdb.changeCodecVersion', { changeCodecVersion: 2 }],
    ['schemaFingerprint', { schemaFingerprint: 'e'.repeat(64) }]
  ])('%s 不匹配', (field, overrides) => {
    const error = expectThrows(
      () => assertRxDBBackupCompatible(sampleManifest(), target(overrides)),
      'incompatible_archive',
      field
    );
    expect(error.details.expected).toBeDefined();
    expect(error.details.actual).toBeDefined();
  });

  it('目标多出的扩展不影响兼容', () => {
    expect(() =>
      assertRxDBBackupCompatible(sampleManifest({ adapter: { ...sampleManifest().adapter, extensions: [] } }), target())
    ).not.toThrow();
  });

  it('认证域不同报 auth_domain_mismatch（AC#13）', () => {
    const manifest = sampleManifest({ encryption: { authDomain: 'notes@0_1' } });
    expectThrows(
      () => assertRxDBBackupCompatible(manifest, target({ authDomain: 'other@0_1' })),
      'auth_domain_mismatch',
      'encryption.authDomain'
    );
  });

  it('认证域相同即可，与物理位置无关', () => {
    const manifest = sampleManifest({ encryption: { authDomain: 'notes@0_1' } });
    expect(() => assertRxDBBackupCompatible(manifest, target({ authDomain: 'notes@0_1' }))).not.toThrow();
  });

  it('一边加密一边不加密', () => {
    const encrypted = sampleManifest({ encryption: { authDomain: 'notes@0_1' } });
    expectThrows(() => assertRxDBBackupCompatible(encrypted, target()), 'incompatible_archive', 'encryption');
    expectThrows(
      () => assertRxDBBackupCompatible(sampleManifest(), target({ authDomain: 'notes@0_1' })),
      'incompatible_archive',
      'encryption'
    );
  });
});
