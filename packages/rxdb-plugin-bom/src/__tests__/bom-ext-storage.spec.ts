import {
  advancedIndexesOf,
  compileAdvancedIndex,
  compileGeneratedColumn,
  generatedColumnsOf,
  getEntityMetadata,
  getEntityStorageMetadata,
  RxDBConstraintDriftError,
  type EntityStorageOverride,
  type MigrationType,
  type TransactionExecutor
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { BOM_ENTITIES, BomItem } from '../entities.js';
import { createBomExtStorage, createBomExtStorageMigration, type BomExtStorageOptions } from '../ext-storage.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { BomExtAttrError, buildExtFilterSql } from '../resolve/ext-attr.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import {
  createBomTestAdapter,
  createPlainPersistentDatabase,
  disposeBomTestAdapter,
  type BomTestAdapter
} from './test-utils.js';

/** 声明对应的托管生成列与索引在目录中的物理名。 */
const managedNames = (declarations: readonly EntityStorageOverride[], dialect: 'sqlite' | 'postgres') => {
  const metadata = getEntityStorageMetadata({ config: { entityStorage: declarations } }, BomItem);
  return {
    columns: generatedColumnsOf(metadata).map(column => compileGeneratedColumn(metadata, column, dialect).columnName),
    indexes: advancedIndexesOf(metadata).flatMap(index => compileAdvancedIndex(metadata, index, dialect)?.name ?? [])
  };
};

/** 读物料表上实际存在的托管索引名（`sx_` 前缀）。 */
const managedIndexesOnItem = async (adapter: BomTestAdapter): Promise<string[]> => {
  const result = await adapter.transaction(
    executor =>
      executor.query(
        adapter.name === 'pglite' ?
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'bom' AND tablename = 'item' AND left(indexname, 3) = 'sx_' ORDER BY 1`
        : `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'bom$item' AND name LIKE 'sx\\_%' ESCAPE '\\' ORDER BY 1`
      ),
    false
  );
  return result.rows.map(row => String(row[0]));
};

const measureMigration = (migration: MigrationType, backend: string): MigrationType => ({
  ...migration,
  async up(executor) {
    const started = performance.now();
    let auditFinished: number | undefined;
    let indexesStarted: number | undefined;
    const samples: { sql: string; ms: number }[] = [];
    const measured: TransactionExecutor = new Proxy(executor, {
      get(target, key) {
        if (key !== 'query') return Reflect.get(target, key, target);
        return async (sql: string, params?: readonly unknown[]) => {
          if (/^(ALTER|CREATE)/.test(sql) && auditFinished === undefined) auditFinished = performance.now();
          if (/^CREATE INDEX/.test(sql) && indexesStarted === undefined) indexesStarted = performance.now();
          const start = performance.now();
          const result = await target.query(sql, params);
          samples.push({ sql, ms: performance.now() - start });
          return result;
        };
      }
    });
    await migration.up(measured);
    const finished = performance.now();
    console.info(
      'BOM_STORAGE_MIGRATION',
      JSON.stringify({
        backend,
        name: migration.name,
        samples,
        auditMs: (auditFinished ?? finished) - started,
        generatedMs: (indexesStarted ?? finished) - (auditFinished ?? finished),
        indexesMs: finished - (indexesStarted ?? finished),
        totalMs: finished - started
      })
    );
  }
});

const options = (): BomExtStorageOptions => ({
  hotFields: [
    { scope: 'item', code: 'rohs_status', dataType: 'string' },
    { scope: 'bom_header', code: `quoted.key'"`, dataType: 'number' },
    { scope: 'bom_line_occurrence', code: 'active', dataType: 'boolean' }
  ]
});

describe('BOM 纯存储配置', () => {
  it('生成确定、冻结且独立的三作用域声明，默认不安装 GIN 或改变实体类', () => {
    const original = getEntityMetadata(BomItem);
    const declarations = createBomExtStorage(options());
    expect(declarations).toEqual(createBomExtStorage(options()));
    expect(declarations).toHaveLength(3);
    expect(Object.isFrozen(declarations)).toBe(true);
    expect(Object.isFrozen(declarations[0].generatedColumns?.[0].expression)).toBe(true);
    expect(declarations.every(value => value.indexes?.every(index => index.method !== 'gin'))).toBe(true);
    expect(original.generatedColumnMap.size).toBe(0);
  });

  it('GIN 显式开关只面向 PostgreSQL，不要求 SQLite 支持 GIN', () => {
    const declarations = createBomExtStorage({ hotFields: [], gin: true });
    expect(declarations).toHaveLength(3);
    for (const declaration of declarations) {
      expect(declaration.indexes).toEqual([
        expect.objectContaining({
          method: 'gin',
          dialects: ['postgres'],
          expression: { kind: 'jsonDocument', property: 'ext', jsonText: true }
        })
      ]);
    }
  });

  it('非法作用域、重复键、未知类型与日期提升明确拒绝', () => {
    for (const invalid of [
      { hotFields: [{ scope: 'unknown', code: 'x', dataType: 'string' }] },
      { hotFields: [{ scope: 'item', code: 'x', dataType: 'date' }] },
      { hotFields: [{ scope: 'item', code: 'x', dataType: 'object' }] },
      { hotFields: [...options().hotFields, options().hotFields[0]] }
    ])
      expect(() => createBomExtStorage(invalid as BomExtStorageOptions)).toThrow(BomExtAttrError);
  });

  it('迁移声明在进入事务前拒绝 SQLite 实际生效的 GIN，不先执行任何 DDL', () => {
    expect(() =>
      createBomExtStorageMigration('unsupported-gin', 'sqlite', [
        {
          entity: BomItem,
          indexes: [
            {
              name: 'ext_gin',
              method: 'gin',
              expression: { kind: 'jsonDocument', property: 'ext', jsonText: true }
            }
          ]
        }
      ])
    ).toThrow(/SQLite.*gin|SQLite.*GIN/);
  });

  it('GIN 透明谓词保留已有表引用参数，连接两张 ext 表时不产生歧义', () => {
    const entityStorage = createBomExtStorage({ hotFields: [], gin: true });
    const metadata = getEntityStorageMetadata({ config: { entityStorage } }, BomItem);
    const { sql } = buildExtFilterSql(
      'pglite',
      'i',
      [{ code: 'cold', op: 'eq', value: 'x', dataType: 'string' }],
      metadata
    );
    expect(sql).toContain('i."ext"');
    expect(sql).toContain('@>');
  });
});

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  const dialect = backend === 'pglite' ? 'postgres' : 'sqlite';
  describe(`BOM 存量审计与显式存储迁移 [${backend}]`, () => {
    it('旧持久库经过审计和显式迁移后重开，原始 ext 字节不变且不用回填', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      const declarations = createBomExtStorage({
        hotFields: [{ scope: 'item', code: 'rohs_status', dataType: 'string' }],
        gin: true
      });
      const plain = await createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true });
      const rowId = deterministicId(`migration-${backend}`);
      const ext = '{ "rohs_status": "yes", "untouched": 3 }';
      const table = bomSqlDialectFor(backend).table('item');
      try {
        await plain.transaction(
          executor =>
            executor.query(
              `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "itemNo", "ext") VALUES ('${rowId}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'legacy', '${ext}')`
            ),
          false
        );
      } finally {
        await disposeBomTestAdapter(plain);
      }
      await expect(
        createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true, entityStorage: declarations })
      ).rejects.toBeInstanceOf(RxDBConstraintDriftError);
      const migration = measureMigration(
        createBomExtStorageMigration('023-audited-storage', dialect, declarations),
        backend
      );
      const migrationStarted = performance.now();
      const upgraded = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName,
        persistent: true,
        entityStorage: declarations,
        migrations: [migration]
      });
      console.info(
        'BOM_STORAGE_MIGRATION',
        JSON.stringify({ backend, totalConnectAndMigrationMs: performance.now() - migrationStarted })
      );
      try {
        const original = getEntityMetadata(BomItem);
        const generated = declarations.find(value => value.entity === BomItem)!.generatedColumns![0];
        const column = compileGeneratedColumn(original, generated, dialect);
        const rows = await upgraded.transaction(
          executor => executor.query(`SELECT "ext", "${column.columnName}" FROM ${table}`),
          false
        );
        expect(rows.rows).toEqual([[ext, 'yes']]);
      } finally {
        await disposeBomTestAdapter(upgraded);
      }
      const reopened = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName,
        persistent: true,
        entityStorage: declarations,
        migrations: [migration]
      });
      await disposeBomTestAdapter(reopened);
    }, 60_000);

    it('同一版本首次引入 BOM 实体与热字段迁移：缺表不审计不补 DDL，建表路径带上生成列与索引', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      const declarations = createBomExtStorage({
        hotFields: [{ scope: 'item', code: 'rohs_status', dataType: 'string' }],
        gin: true
      });
      const migration = createBomExtStorageMigration('023-introduce-storage', dialect, declarations);
      const open = () =>
        createBomTestAdapter(backend, BOM_ENTITIES, {
          dbName,
          persistent: true,
          entityStorage: declarations,
          migrations: [migration]
        });
      await createPlainPersistentDatabase(backend, dbName);
      const names = managedNames(declarations, dialect);
      const introduced = await open();
      try {
        const ext = '{"rohs_status":"yes"}';
        const table = bomSqlDialectFor(backend).table('item');
        await introduced.transaction(
          executor =>
            executor.query(
              `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "itemNo", "ext") VALUES ('${deterministicId(`introduce-${backend}`)}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'introduced', '${ext}')`
            ),
          false
        );
        const rows = await introduced.transaction(
          executor => executor.query(`SELECT "ext", "${names.columns[0]}" FROM ${table}`),
          false
        );
        expect(rows.rows).toEqual([[ext, 'yes']]);
        expect(await managedIndexesOnItem(introduced)).toEqual([...names.indexes].sort());
        const watermarks = await introduced.transaction(
          executor =>
            executor.query(
              `SELECT "name" FROM ${backend === 'pglite' ? '"rxdb"."rxdb_migration"' : '"rxdb$rxdb_migration"'} WHERE "name" = '023-introduce-storage'`
            ),
          false
        );
        expect(watermarks.rows).toEqual([['023-introduce-storage']]);
      } finally {
        await disposeBomTestAdapter(introduced);
      }
      await disposeBomTestAdapter(await open());
    }, 60_000);

    it('v2 增加热字段并以新迁移名重放声明全集：只补缺失的列与索引，不撞重复列', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      const rohs = { scope: 'item', code: 'rohs_status', dataType: 'string' } as const;
      const lead = { scope: 'item', code: 'lead_days', dataType: 'number' } as const;
      const v1 = createBomExtStorage({ hotFields: [rohs], gin: true });
      const v2 = createBomExtStorage({ hotFields: [rohs, lead], gin: true });
      const migrations = [
        createBomExtStorageMigration('023-hot-v1', dialect, v1),
        createBomExtStorageMigration('023-hot-v2', dialect, v2)
      ];
      await disposeBomTestAdapter(
        await createBomTestAdapter(backend, BOM_ENTITIES, {
          dbName,
          persistent: true,
          entityStorage: v1,
          migrations: migrations.slice(0, 1)
        })
      );
      const open = () =>
        createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true, entityStorage: v2, migrations });
      const upgraded = await open();
      const names = managedNames(v2, dialect);
      try {
        const table = bomSqlDialectFor(backend).table('item');
        await upgraded.transaction(
          executor =>
            executor.query(
              `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "itemNo", "ext") VALUES ('${deterministicId(`incremental-${backend}`)}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'incremental', '{"rohs_status":"yes","lead_days":3}')`
            ),
          false
        );
        const rows = await upgraded.transaction(
          executor => executor.query(`SELECT ${names.columns.map(column => `"${column}"`).join(', ')} FROM ${table}`),
          false
        );
        expect(rows.rows.map(([rohsValue, leadValue]) => [rohsValue, Number(leadValue)])).toEqual([['yes', 3]]);
        expect(await managedIndexesOnItem(upgraded)).toEqual([...names.indexes].sort());
      } finally {
        await disposeBomTestAdapter(upgraded);
      }
      await disposeBomTestAdapter(await open());
    }, 60_000);

    it('同名托管索引被改成别的定义：漂移检查报 Changed definitions，增量迁移也不静默接受', async () => {
      const dbName = `h-${crypto.randomUUID()}`;
      const rohs = { scope: 'item', code: 'rohs_status', dataType: 'string' } as const;
      const v1 = createBomExtStorage({ hotFields: [rohs] });
      const v2 = createBomExtStorage({ hotFields: [rohs, { scope: 'item', code: 'lead_days', dataType: 'number' }] });
      const m1 = createBomExtStorageMigration('023-tamper-v1', dialect, v1);
      const [indexName] = managedNames(v1, dialect).indexes;
      const tamper = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName,
        persistent: true,
        entityStorage: v1,
        migrations: [m1]
      });
      try {
        await tamper.transaction(async executor => {
          await executor.query(backend === 'pglite' ? `DROP INDEX "bom"."${indexName}"` : `DROP INDEX "${indexName}"`);
          await executor.query(`CREATE INDEX "${indexName}" ON ${executor.tableRef(BomItem)} ("itemNo")`);
        }, false);
      } finally {
        await disposeBomTestAdapter(tamper);
      }
      const attempts = [
        { entityStorage: v1, migrations: [m1] },
        { entityStorage: v2, migrations: [m1, createBomExtStorageMigration('023-tamper-v2', dialect, v2)] }
      ];
      for (const attempt of attempts) {
        const failure = await createBomTestAdapter(backend, BOM_ENTITIES, {
          dbName,
          persistent: true,
          ...attempt
        }).then(
          async adapter => {
            await disposeBomTestAdapter(adapter);
            return null;
          },
          (cause: unknown) => cause
        );
        expect(failure).toBeInstanceOf(RxDBConstraintDriftError);
        const drift = failure as RxDBConstraintDriftError;
        expect({ missing: drift.missing, extra: drift.extra, changed: drift.changed }).toEqual({
          missing: [],
          extra: [],
          changed: [indexName]
        });
        expect(drift.message).toContain('Changed definitions');
      }
    }, 60_000);

    for (const [label, ext] of [
      ['JSON', 'broken-json'],
      ['type', '{"rohs_status":3}']
    ] as const) {
      it(`${label} 坏值在 DDL 前拒绝并点名行与热键，迁移水位不推进`, async () => {
        const dbName = `h-${crypto.randomUUID()}`;
        const declarations: readonly EntityStorageOverride[] = createBomExtStorage({
          hotFields: [{ scope: 'item', code: 'rohs_status', dataType: 'string' }]
        });
        const plain = await createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true });
        const rowId = deterministicId(`bad-${backend}-${label}`);
        const table = bomSqlDialectFor(backend).table('item');
        try {
          await plain.transaction(
            executor =>
              executor.query(
                `INSERT INTO ${table} ("id", "createdAt", "updatedAt", "itemNo", "ext") VALUES ('${rowId}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'legacy-bad', '${ext}')`
              ),
            false
          );
        } finally {
          await disposeBomTestAdapter(plain);
        }
        const migration = measureMigration(
          createBomExtStorageMigration('023-audited-storage', dialect, declarations),
          backend
        );
        const failure = await createBomTestAdapter(backend, BOM_ENTITIES, {
          dbName,
          persistent: true,
          entityStorage: declarations,
          migrations: [migration]
        }).then(
          () => null,
          (cause: unknown) => cause
        );
        expect(failure).toBeInstanceOf(BomExtAttrError);
        expect(String(failure)).toContain(rowId);
        expect(String(failure)).toContain('rohs_status');
        const reopened = await createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true });
        try {
          const tableName = backend === 'pglite' ? '"rxdb"."rxdb_migration"' : '"rxdb$rxdb_migration"';
          const watermarks = await reopened.transaction(
            executor => executor.query(`SELECT "name" FROM ${tableName} WHERE "name" = '023-audited-storage'`),
            false
          );
          expect(watermarks.rows).toEqual([]);
          expect(
            (await reopened.transaction(executor => executor.query(`SELECT "ext" FROM ${table}`), false)).rows
          ).toEqual([[ext]]);
        } finally {
          await disposeBomTestAdapter(reopened);
        }
      }, 60_000);
    }
  });
}
