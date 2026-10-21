/**
 * @fileoverview PGlite 生成列漂移的前缀契约：库里任何 `gc_` 列都归漂移检查管，不论是不是生成列。
 *
 * 在真实内存 PGlite 上建表后改目录，再调 `adapter.checkEntityConstraints()` 断言多余与定义不符。
 */

import {
  compileGeneratedColumn,
  Entity,
  EntityBase,
  generatedColumnsOf,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RxDBConstraintDriftError,
  SyncType,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { getTableNameByMetadata } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

@Entity({
  name: 'DriftColumns',
  namespace: 'drift-fixtures',
  tableName: 'drift_columns',
  log: false,
  properties: [{ name: 'ext', type: PropertyType.string, nullable: true }]
})
class DriftColumnsPlain extends EntityBase {}

@Entity({
  name: 'DriftColumns',
  namespace: 'drift-fixtures',
  tableName: 'drift_columns',
  log: false,
  generatedColumns: [
    {
      name: 'rohs_hot',
      expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
    }
  ]
})
class DriftColumnsGenerated extends DriftColumnsPlain {}

/** 普通属性恰好以 gc_ 起头：它是实体自己声明的列，不归生成列漂移管。 */
@Entity({
  name: 'DriftOwnColumns',
  namespace: 'drift-fixtures',
  tableName: 'drift_own_columns',
  log: false,
  properties: [
    { name: 'ext', type: PropertyType.string, nullable: true },
    { name: 'gc_flag', type: PropertyType.string, nullable: true }
  ],
  generatedColumns: [
    {
      name: 'rohs_hot',
      expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
    }
  ]
})
class DriftOwnColumns extends EntityBase {}

const table = (): string => getTableNameByMetadata(getEntityMetadata(DriftColumnsPlain));

const declaredColumnName = (): string => {
  const metadata = getEntityMetadata(DriftColumnsGenerated);
  return compileGeneratedColumn(metadata, generatedColumnsOf(metadata)[0], 'postgres').columnName;
};

const openDatabase = async (
  entity: EntityType
): Promise<{ adapter: RxDBAdapterPGlite; dispose: () => Promise<void> }> => {
  let adapter: RxDBAdapterPGlite | undefined;
  const rxdb = new RxDB({
    dbName: `drift-columns-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    context: { userId: 'userId' },
    entities: [entity],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async database => {
    adapter = new RxDBAdapterPGlite(database, { store: 'memory' });
    return adapter;
  });
  await rxdb.connect('pglite');
  if (!adapter) throw new Error('adapter not created');
  return { adapter, dispose: () => rxdb.disconnectAll().catch(() => undefined) };
};

const driftOf = async (adapter: RxDBAdapterPGlite, entity: EntityType): Promise<RxDBConstraintDriftError> => {
  const error = await adapter.checkEntityConstraints([entity]).then(
    () => undefined,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(RxDBConstraintDriftError);
  return error as RxDBConstraintDriftError;
};

describe('PGlite 生成列漂移：gc_ 前缀列全部纳入比对', () => {
  it('与声明的生成列并存的用户普通 gc_ 列判多余', async () => {
    const { adapter, dispose } = await openDatabase(DriftColumnsGenerated);
    try {
      await expect(adapter.checkEntityConstraints([DriftColumnsGenerated])).resolves.toBeUndefined();
      await adapter.query(`ALTER TABLE ${table()} ADD COLUMN "gc_note" TEXT`);
      const drift = await driftOf(adapter, DriftColumnsGenerated);
      expect(drift.missing).toEqual([]);
      expect(drift.extra).toEqual(['gc_note']);
      expect(drift.changed).toEqual([]);
    } finally {
      await dispose();
    }
  });

  it('未声明任何生成列的表上，用户普通 gc_ 列同样判多余', async () => {
    const { adapter, dispose } = await openDatabase(DriftColumnsPlain);
    try {
      await expect(adapter.checkEntityConstraints([DriftColumnsPlain])).resolves.toBeUndefined();
      await adapter.query(`ALTER TABLE ${table()} ADD COLUMN "gc_note" TEXT`);
      const drift = await driftOf(adapter, DriftColumnsPlain);
      expect(drift.missing).toEqual([]);
      expect(drift.extra).toEqual(['gc_note']);
      expect(drift.changed).toEqual([]);
    } finally {
      await dispose();
    }
  });

  it('实体自己声明的同前缀普通属性列不算多余', async () => {
    const { adapter, dispose } = await openDatabase(DriftOwnColumns);
    try {
      await expect(adapter.checkEntityConstraints([DriftOwnColumns])).resolves.toBeUndefined();
    } finally {
      await dispose();
    }
  });

  it('声明了生成列、库里同名的却是普通列：判定义不符而不是缺失（与 SQLite 同口径）', async () => {
    const { adapter, dispose } = await openDatabase(DriftColumnsPlain);
    try {
      const columnName = declaredColumnName();
      await adapter.query(`ALTER TABLE ${table()} ADD COLUMN "${columnName}" TEXT`);
      const drift = await driftOf(adapter, DriftColumnsGenerated);
      expect(drift.missing).toEqual([]);
      expect(drift.extra).toEqual([]);
      expect(drift.changed).toEqual([columnName]);
    } finally {
      await dispose();
    }
  });
});
