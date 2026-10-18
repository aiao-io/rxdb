import {
  compileGeneratedColumn,
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
import { createBomTestAdapter, disposeBomTestAdapter } from './test-utils.js';

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
