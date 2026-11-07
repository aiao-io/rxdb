import {
  advancedIndexesOf,
  compileAdvancedIndex,
  compileGeneratedColumn,
  Entity,
  EntityBase,
  generatedColumnsOf,
  getEntityMetadata,
  PropertyType,
  quoteSqlIdentifier,
  RxDBConstraintDriftError,
  RxDBMigration,
  type EntityGeneratedColumnMetadataOptions,
  type EntityPropertyMetadataOptions,
  type MigrationType,
  type StorageDialect,
  type TransactionExecutor,
  type UUID
} from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const columns: EntityGeneratedColumnMetadataOptions[] = [
  {
    name: 'rohs_hot',
    expression: { kind: 'jsonScalar', property: 'ext', key: 'rohs_status', dataType: 'string', jsonText: true }
  },
  {
    name: 'lead_hot',
    expression: { kind: 'jsonScalar', property: 'ext', key: 'lead_days', dataType: 'number', jsonText: true }
  },
  {
    name: 'active_hot',
    expression: { kind: 'jsonScalar', property: 'ext', key: 'active', dataType: 'boolean', jsonText: true }
  }
];

const storageProperties: EntityPropertyMetadataOptions[] = [
  { name: 'ext', columnName: 'ext_json', type: PropertyType.string, nullable: true },
  { name: 'title', type: PropertyType.string },
  { name: 'score', type: PropertyType.number }
];

@Entity({
  name: 'StorageRow',
  namespace: 'hot_storage',
  tableName: 'row',
  log: false,
  properties: storageProperties
})
class PlainRow extends EntityBase {
  ext!: string | null;
  title!: string;
  score!: number;
}

@Entity({
  name: 'StorageRow',
  namespace: 'hot_storage',
  tableName: 'row',
  log: false,
  properties: storageProperties,
  generatedColumns: columns,
  indexes: [
    { name: 'rohs_lookup', properties: ['rohs_hot'] },
    { name: 'lead_expression', expression: columns[1].expression },
    {
      name: 'ext_gin',
      expression: { kind: 'jsonDocument', property: 'ext', jsonText: true },
      method: 'gin',
      dialects: ['postgres']
    },
    { name: 'score_gist', properties: ['score'], method: 'gist', dialects: ['postgres'] }
  ]
})
class IndexedRow extends EntityBase {
  ext!: string | null;
  title!: string;
  score!: number;
}

@Entity({
  name: 'StorageBootstrap',
  namespace: 'hot_storage',
  log: false,
  properties: [
    { name: 'bucket', type: PropertyType.string },
    { name: 'from', type: PropertyType.integer },
    { name: 'to', type: PropertyType.integer }
  ],
  exclusions: [{ name: 'bootstrap_range', equal: ['bucket'], ranges: [{ from: 'from', to: 'to', bounds: '[]' }] }]
})
class StorageBootstrap extends EntityBase {}

const dialectOf = (backend: BomTestBackend): StorageDialect => (backend === 'pglite' ? 'postgres' : 'sqlite');
const tableOf = (backend: BomTestBackend): string =>
  backend === 'pglite' ? '"hot_storage"."row"' : '"hot_storage$row"';
const indexOf = (backend: BomTestBackend, name: string): string =>
  backend === 'pglite' ? `"hot_storage".${quoteSqlIdentifier(name)}` : quoteSqlIdentifier(name);

const query = (adapter: BomTestAdapter, sql: string, params: unknown[] = []) =>
  adapter.transaction(executor => executor.query(sql, params), false);

const compiledColumns = (backend: BomTestBackend) => {
  const metadata = getEntityMetadata(IndexedRow);
  return generatedColumnsOf(metadata).map(column => compileGeneratedColumn(metadata, column, dialectOf(backend)));
};

const compiledIndex = (backend: BomTestBackend, name: string) => {
  const metadata = getEntityMetadata(IndexedRow);
  const declaration = metadata.indexMap.get(name);
  if (declaration === undefined) throw new Error(`测试索引不存在：${name}`);
  const result = compileAdvancedIndex(metadata, declaration, dialectOf(backend));
  if (result === null) throw new Error(`测试索引不属于当前方言：${name}`);
  return result;
};

const indexSql = (backend: BomTestBackend, name: string): string => {
  const index = compiledIndex(backend, name);
  const target =
    index.expression === undefined ?
      index.columns.map(quoteSqlIdentifier).join(', ')
    : `(${index.expression})${index.operatorClass === undefined ? '' : ` ${index.operatorClass}`}`;
  return (
    `CREATE INDEX ${quoteSqlIdentifier(index.name)} ON ${tableOf(backend)}` +
    `${backend === 'pglite' ? ` USING ${index.method}` : ''} (${target})`
  );
};

const installStorage = async (executor: TransactionExecutor, backend: BomTestBackend): Promise<void> => {
  if (backend === 'pglite') await executor.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
  for (const column of compiledColumns(backend)) {
    await executor.query(
      `ALTER TABLE ${tableOf(backend)} ADD COLUMN ${quoteSqlIdentifier(column.columnName)} ${column.sqlType}` +
        ` GENERATED ALWAYS AS (${column.expression}) ${column.storage.toUpperCase()}`
    );
  }
  const metadata = getEntityMetadata(IndexedRow);
  for (const declaration of advancedIndexesOf(metadata)) {
    const index = compileAdvancedIndex(metadata, declaration, dialectOf(backend));
    if (index !== null) await executor.query(indexSql(backend, declaration.name));
  }
};

const seed = async (
  adapter: BomTestAdapter,
  ext: Record<string, unknown> | null,
  title = '原字段'
): Promise<PlainRow> => {
  const row = adapter.rxdb.entityManager.instantiate(PlainRow, {
    ext: ext === null ? null : JSON.stringify(ext),
    title,
    score: 3
  });
  return adapter.rxdb.entityManager.getRepository(PlainRow).create(row);
};

const withManualStorage = async (
  backend: BomTestBackend,
  run: (adapter: BomTestAdapter) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend, [PlainRow, StorageBootstrap]);
  try {
    await adapter.transaction(executor => installStorage(executor, backend), false);
    await run(adapter);
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const migration = (backend: BomTestBackend, fail = false): MigrationType => ({
  name: '023-hot-storage',
  async up(executor) {
    await installStorage(executor, backend);
    if (fail) throw new Error('受控迁移失败');
  },
  async down() {
    throw new Error('测试不执行反向迁移');
  }
});

const freshPersistent = async (backend: BomTestBackend, dbName: string): Promise<UUID> => {
  const adapter = await createBomTestAdapter(backend, [PlainRow, StorageBootstrap], { dbName, persistent: true });
  try {
    return (await seed(adapter, { rohs_status: 'yes', lead_days: 3, active: true })).id;
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`US-030D 真实生成列、索引与持久迁移 [${backend}]`, () => {
    it('新库自动创建 VIRTUAL/STORED 生成列及声明方法索引，PG 自动装载 GiST 扩展', async () => {
      const adapter = await createBomTestAdapter(backend, [IndexedRow]);
      try {
        const metadata = getEntityMetadata(IndexedRow);
        const row = adapter.rxdb.entityManager.instantiate(IndexedRow, {
          ext: JSON.stringify({ rohs_status: 'yes', lead_days: 3, active: true }),
          title: '自动建表',
          score: 3
        });
        await adapter.rxdb.entityManager.getRepository(IndexedRow).create(row);
        const names = compiledColumns(backend).map(column => column.columnName);
        const result = await query(
          adapter,
          `SELECT ${names.map(quoteSqlIdentifier).join(', ')} FROM ${tableOf(backend)}`
        );
        expect(result.rows[0][0]).toBe('yes');
        expect(Number(result.rows[0][1])).toBe(3);
        expect(Boolean(result.rows[0][2])).toBe(true);
        await expect(adapter.checkEntityConstraints([IndexedRow])).resolves.toBeUndefined();
        const actual =
          backend === 'pglite' ?
            await query(
              adapter,
              `SELECT attname, attgenerated FROM pg_attribute WHERE attrelid = '"hot_storage"."row"'::regclass AND attgenerated <> ''`
            )
          : await query(adapter, `PRAGMA table_xinfo('hot_storage$row')`);
        for (const column of compiledColumns(backend)) {
          const found = actual.rows.find(row => row[backend === 'pglite' ? 0 : 1] === column.columnName);
          expect(found?.[backend === 'pglite' ? 1 : 6]).toBe(backend === 'pglite' ? 's' : 2);
        }
        expect(metadata.propertyMap.has('rohs_hot')).toBe(false);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('真实 JSON 标量守卫拒绝异类转换，缺键/null 为 NULL，更新原字段自动重算且生成列不可直写', async () => {
      await withManualStorage(backend, async adapter => {
        const row = await seed(adapter, { rohs_status: 'yes', lead_days: '3', active: 1 });
        const names = compiledColumns(backend).map(column => column.columnName);
        const read = () =>
          query(adapter, `SELECT ${names.map(quoteSqlIdentifier).join(', ')} FROM ${tableOf(backend)}`);
        expect((await read()).rows).toEqual([['yes', null, null]]);
        await adapter.rxdb.entityManager
          .getRepository(PlainRow)
          .update(row, { ext: JSON.stringify({ lead_days: 4, active: false }) });
        const values = (await read()).rows[0];
        expect(values[0]).toBeNull();
        expect(Number(values[1])).toBe(4);
        expect(Boolean(values[2])).toBe(false);
        await expect(
          query(adapter, `UPDATE ${tableOf(backend)} SET ${quoteSqlIdentifier(names[0])} = 'forbidden'`)
        ).rejects.toThrow();
        await adapter.rxdb.entityManager.getRepository(PlainRow).update(row, { ext: null });
        expect((await read()).rows).toEqual([[null, null, null]]);
      });
    });

    it('缺失托管索引报漂移，只读检查与 PG reconcile 都不自动补建', async () => {
      await withManualStorage(backend, async adapter => {
        const index = compiledIndex(backend, 'rohs_lookup');
        await query(adapter, `DROP INDEX ${indexOf(backend, index.name)}`);
        await expect(adapter.checkEntityConstraints([IndexedRow])).rejects.toMatchObject({
          missing: expect.arrayContaining([index.name])
        });
        if (adapter instanceof RxDBAdapterPGlite) await adapter.reconcileEntityIndexes([IndexedRow]);
        await expect(adapter.checkEntityConstraints([IndexedRow])).rejects.toBeInstanceOf(RxDBConstraintDriftError);
      });
    });

    it('索引名未变但实际表达式被换掉同样报漂移，目录中的错误索引保持原样', async () => {
      await withManualStorage(backend, async adapter => {
        const index = compiledIndex(backend, 'rohs_lookup');
        await query(adapter, `DROP INDEX ${indexOf(backend, index.name)}`);
        await query(adapter, `CREATE INDEX ${quoteSqlIdentifier(index.name)} ON ${tableOf(backend)} ("title")`);
        await expect(adapter.checkEntityConstraints([IndexedRow])).rejects.toThrow(index.name);
        const actual =
          backend === 'pglite' ?
            await query(
              adapter,
              `SELECT indexdef FROM pg_indexes WHERE schemaname = 'hot_storage' AND indexname = $1`,
              [index.name]
            )
          : await query(adapter, `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`, [index.name]);
        expect(String(actual.rows[0][0])).toContain('title');
      });
    });

    it('生成列或索引声明被移除但持久对象仍存在时报告多余', async () => {
      await withManualStorage(backend, async adapter => {
        await expect(adapter.checkEntityConstraints([PlainRow])).rejects.toMatchObject({
          extra: expect.arrayContaining([compiledIndex(backend, 'rohs_lookup').name])
        });
      });
    });

    it('真实持久旧库升级未提供迁移时拒绝连接，不自动创建索引', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      await freshPersistent(backend, dbName);
      let unexpected: BomTestAdapter | undefined;
      try {
        await expect(
          createBomTestAdapter(backend, [IndexedRow, StorageBootstrap], { dbName, persistent: true }).then(adapter => {
            unexpected = adapter;
            return adapter;
          })
        ).rejects.toBeInstanceOf(RxDBConstraintDriftError);
      } finally {
        if (unexpected !== undefined) await disposeBomTestAdapter(unexpected);
      }
    });

    it('显式迁移后无需手工回填，断开重开仍保留原 ext 与生成值，迁移只执行一次', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      const id = await freshPersistent(backend, dbName);
      const options = { dbName, persistent: true, migrations: [migration(backend)] };
      const upgraded = await createBomTestAdapter(backend, [IndexedRow, StorageBootstrap], options);
      await disposeBomTestAdapter(upgraded);
      const reopened = await createBomTestAdapter(backend, [IndexedRow, StorageBootstrap], options);
      try {
        const stored = await firstValueFrom(reopened.rxdb.entityManager.getRepository(IndexedRow).get(id));
        expect(JSON.parse(stored.ext!)).toEqual({ rohs_status: 'yes', lead_days: 3, active: true });
        const generated = compiledColumns(backend)[0];
        expect(
          (await query(reopened, `SELECT ${quoteSqlIdentifier(generated.columnName)} FROM ${tableOf(backend)}`)).rows
        ).toEqual([['yes']]);
        const count = await reopened.transaction(
          executor =>
            executor.query(
              `SELECT COUNT(*) FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${backend === 'pglite' ? '$1' : '?'}`,
              ['023-hot-storage']
            ),
          false
        );
        expect(Number(count.rows[0][0])).toBe(1);
      } finally {
        await disposeBomTestAdapter(reopened);
      }
    });

    it('迁移中途失败整批回滚，不残留生成列/索引或推进迁移水位', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      await freshPersistent(backend, dbName);
      await expect(
        createBomTestAdapter(backend, [IndexedRow, StorageBootstrap], {
          dbName,
          persistent: true,
          migrations: [migration(backend, true)]
        })
      ).rejects.toThrow('受控迁移失败');
      const reopened = await createBomTestAdapter(backend, [PlainRow, StorageBootstrap], { dbName, persistent: true });
      try {
        const catalog =
          backend === 'pglite' ?
            await query(
              reopened,
              `SELECT attname FROM pg_attribute WHERE attrelid = '"hot_storage"."row"'::regclass AND attnum > 0`
            )
          : await query(reopened, `PRAGMA table_xinfo('hot_storage$row')`);
        expect(
          catalog.rows.some(row => row[backend === 'pglite' ? 0 : 1] === compiledColumns(backend)[0].columnName)
        ).toBe(false);
        const count = await reopened.transaction(
          executor =>
            executor.query(
              `SELECT COUNT(*) FROM ${executor.tableRef(RxDBMigration)} WHERE "name" = ${backend === 'pglite' ? '$1' : '?'}`,
              ['023-hot-storage']
            ),
          false
        );
        expect(Number(count.rows[0][0])).toBe(0);
      } finally {
        await disposeBomTestAdapter(reopened);
      }
    });
  });
}
