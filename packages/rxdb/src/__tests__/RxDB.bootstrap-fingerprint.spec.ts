/**
 * @fileoverview 引导指纹：表结构与迁移集没变时，二次连接跳过表探测、迁移与约束漂移检查。
 *
 * @remarks
 * 指纹行与迁移行同存一张 `rxdb_migration` 表：完整引导成功后写 `__rxdb_bootstrap__<指纹>`，
 * 下一次连接在守卫的同一趟只读事务里读到它，命中即只跑系统 schema 版本检查与插件引导，
 * 跳过逐表探测（每次连接十几次往返）、迁移事务与 `sqlite_master` 漂移比对。
 * 指纹覆盖实体结构（含 checks / exclusions / log）与系统/接入方迁移名，任一变化都会
 * 让指纹失配、回落完整引导；旧版本的指纹行不清理，按集合比对。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { computeBootstrapFingerprint, readBootstrapFingerprints } from '../system/bootstrap-fingerprint.js';
import { RxDBMigration } from '../system/migration.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';
import { TEST_ENTITIES } from './fixtures/test-entities.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

const isBootstrapFingerprintRow = (record: { name: string }): boolean => record.name.startsWith('__rxdb_bootstrap__');

/** 造一个「表已存在」的库，并给 `RxDBMigration` 换一份**有存储**的仓库桩。 */
const createExistingDatabase = (migrations: RxDBOptions['migrations'] = []) => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-bootstrap-fp-${databaseSequence}`,
    entities: TEST_ENTITIES,
    sync: { local: { adapter: 'local' }, type: SyncType.None } as RxDBOptions['sync'],
    migrations
  });
  const adapter = createMockAdapter(database);
  database.adapter('local', () => adapter);
  adapter.isTableExisted.mockResolvedValue(true);
  // 默认桩不保存行：完整引导写下的指纹行会丢，第二次连接永远失配。换成有存储的一份，
  // 只替换 RxDBMigration 的仓库（与 migration-watermark 的 RXD-036 组同口径）。
  const stored: { name: string }[] = [];
  const migrationRepository = {
    find: vi.fn(async () => stored.slice()),
    count: vi.fn(async () => stored.length),
    create: vi.fn(async (record: { name: string }) => {
      stored.push(record);
      return record;
    }),
    update: vi.fn(),
    remove: vi.fn()
  };
  const defaultGetRepository = adapter.getRepository.getMockImplementation();
  adapter.getRepository.mockImplementation((EntityType: unknown) =>
    EntityType === RxDBMigration ?
      (migrationRepository as never)
    : (defaultGetRepository?.(EntityType as never) as never)
  );
  databases.add(database);
  return { database, adapter, migrationRepository, stored };
};

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  try {
    await Promise.all(pending.map(database => database.disconnectAll()));
  } finally {
    vi.restoreAllMocks();
  }
});

describe('引导指纹', () => {
  it('指纹未命中时完整引导并写入指纹行', async () => {
    const { database, adapter, migrationRepository } = createExistingDatabase();
    database.init();

    await database.connect('local');

    // 完整引导：系统表与实体表逐张探测
    expect(adapter.isTableExisted).toHaveBeenCalledWith(RxDBMigration);
    expect(adapter.isTableExisted.mock.calls.length).toBeGreaterThan(1);
    // 指纹行随完整引导写进迁移表
    expect(migrationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.stringMatching(/^__rxdb_bootstrap__/) }) as never
    );
  });

  it('结构未变时二次连接跳过迁移与漂移比对，指纹行不再重写，表探测仍保留自愈', async () => {
    const { database, adapter, migrationRepository } = createExistingDatabase([
      { name: 'init-schema', up: vi.fn(async () => undefined), down: vi.fn(async () => undefined) }
    ]);
    adapter.checkEntityConstraints = vi.fn(async () => undefined);
    database.init();
    await database.connect('local');

    const migrateSystemSchema = vi.spyOn(adapter, 'migrateSystemSchema');
    adapter.isTableExisted.mockClear();
    migrationRepository.find.mockClear();
    migrationRepository.create.mockClear();
    vi.mocked(adapter.checkEntityConstraints).mockClear();
    await database.disconnectAll();

    await database.connect('local');

    // 逐表探测保留（既有库补建缺失表是每次连接的自愈契约）
    expect(adapter.isTableExisted.mock.calls.length).toBeGreaterThan(1);
    // 两轮迁移事务跳过：守卫读了一次迁移表，runMigrations 没有再读
    expect(migrationRepository.find).toHaveBeenCalledTimes(1);
    // 指纹行是命中状态，无需重写；约束漂移比对也不重跑
    expect(migrationRepository.create).not.toHaveBeenCalled();
    expect(adapter.checkEntityConstraints).not.toHaveBeenCalled();
    // 系统 schema 版本检查仍然每次都做
    expect(migrateSystemSchema).toHaveBeenCalledTimes(1);
  });

  it('指纹失配时回落完整引导并重写指纹行', async () => {
    const { database, adapter, stored } = createExistingDatabase();
    database.init();
    await database.connect('local');

    // 模拟另一个版本连接过：指纹行被改写（这里直接摘掉）
    stored.splice(0, stored.length, ...stored.filter(record => !isBootstrapFingerprintRow(record)));
    adapter.isTableExisted.mockClear();
    await database.disconnectAll();

    await database.connect('local');

    // 失配 → 完整引导：逐表探测回来了，指纹行也被重写
    expect(adapter.isTableExisted.mock.calls.length).toBeGreaterThan(1);
    expect(stored.some(isBootstrapFingerprintRow)).toBe(true);
  });

  it('首装建表时指纹行随水位线同一批写入', async () => {
    const { database, adapter } = createExistingDatabase();
    adapter.isTableExisted.mockResolvedValue(false);
    const initialMigrations: RxDBMigration[] = [];
    adapter.createTables.mockImplementation(async (_entityTypes, entities = []) => {
      initialMigrations.push(...entities.filter((entity): entity is RxDBMigration => entity instanceof RxDBMigration));
      return true;
    });
    database.init();

    await database.connect('local');

    expect(initialMigrations.some(record => isBootstrapFingerprintRow(record))).toBe(true);
  });
});

describe('computeBootstrapFingerprint / readBootstrapFingerprints', () => {
  it('实体集或迁移集任一变化都会改变指纹，指纹行解析与顺序无关', () => {
    const base = {
      entities: TEST_ENTITIES,
      systemMigrations: ['0001-a', '0002-b'],
      userMigrations: ['init-schema']
    };
    const fingerprint = computeBootstrapFingerprint(base);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // 声明顺序不影响指纹
    expect(computeBootstrapFingerprint({ ...base, systemMigrations: ['0002-b', '0001-a'] })).toBe(fingerprint);
    // 任一维度变化都会失配
    expect(computeBootstrapFingerprint({ ...base, entities: TEST_ENTITIES.slice(0, -1) })).not.toBe(fingerprint);
    expect(computeBootstrapFingerprint({ ...base, systemMigrations: ['0001-a'] })).not.toBe(fingerprint);
    expect(computeBootstrapFingerprint({ ...base, userMigrations: [] })).not.toBe(fingerprint);
    // 解析：多条指纹行都读出来，非指纹行不混入
    expect(readBootstrapFingerprints(['__rxdb_bootstrap__abc', '0001-a', '__rxdb_bootstrap__def'])).toEqual(
      new Set(['abc', 'def'])
    );
  });
});
