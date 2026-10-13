/**
 * @fileoverview PGlite 漂移检查测试（US-030 AC#10 / #11 / #16）。
 *
 * 在真实内存 PGlite 引擎上：建库（建表带 ck_ 约束、uq_ 条件唯一索引、ex_ 区间排他）→ 操纵目录
 * （DROP / ADD 约束与索引）→ 直接调 `adapter.checkEntityConstraints()` 断言缺失与多余。
 * connect() 期间的漂移检查由 check-constraint-contract.spec.ts 隐式覆盖（每次
 * connect 都跑漂移检查且无声明时通过）。
 */

import {
  compileCheckConstraint,
  compileConditionalUniqueIndex,
  compileExclusionConstraint,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBConstraintDriftError,
  SyncType,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { getTableNameByMetadata } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

/**
 * 带 CHECK + 外键关系 + 索引 + 枚举（匿名 CHECK）的实体：
 * 漂移比对只认 `ck_` 起头，其余对象一个都不该报（AC#16）。
 */
@Entity({
  name: 'DriftChecked',
  namespace: 'drift-fixtures',
  log: false,
  properties: [
    { name: 'qty', type: PropertyType.integer, nullable: true },
    { name: 'state', type: PropertyType.enum, enum: ['on', 'off'], nullable: true }
  ],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DriftChecked',
      mappedProperty: 'id',
      nullable: true,
      onDelete: 'SET NULL',
      onUpdate: 'SET NULL'
    }
  ],
  indexes: [{ name: 'qty_idx', properties: ['qty'] }],
  checks: [{ name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } }]
})
class DriftChecked extends EntityBase {
  qty!: number | null;
  state!: 'on' | 'off' | null;
}

const qtyConstraintName = (): string => {
  const metadata = getEntityMetadata(DriftChecked);
  return compileCheckConstraint(metadata, metadata.checkMap.get('qty_positive')!).name;
};

const openDatabase = async (
  entities: readonly EntityType[] = [DriftChecked as EntityType]
): Promise<{ rxdb: RxDB; adapter: RxDBAdapterPGlite; dispose: () => Promise<void> }> => {
  let adapter: RxDBAdapterPGlite | undefined;
  const rxdb = new RxDB({
    dbName: `drift-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    context: { userId: 'userId' },
    entities: [...entities],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async database => {
    adapter = new RxDBAdapterPGlite(database, { store: 'memory' });
    return adapter;
  });
  await rxdb.connect('pglite');
  if (!adapter) throw new Error('adapter not created');
  return {
    rxdb,
    adapter,
    dispose: async () => {
      await rxdb.disconnectAll().catch(() => undefined);
    }
  };
};

describe('PGlite 漂移检查（AC#10 / #11 / #16）', () => {
  it('声明与库一致时不抛错；外键 / 枚举匿名 CHECK / idx_ 索引 / 系统触发器不报多余（AC#16）', async () => {
    const { adapter, dispose } = await openDatabase();
    try {
      await expect(adapter.checkEntityConstraints([DriftChecked as EntityType])).resolves.toBeUndefined();
    } finally {
      await dispose();
    }
  });

  it('AC#10：库里缺一条 CHECK → 抛 RxDBConstraintDriftError 列出缺失，不自动补建', async () => {
    const { adapter, dispose } = await openDatabase();
    try {
      const name = qtyConstraintName();
      await adapter.query(
        `ALTER TABLE ${getTableNameByMetadata(getEntityMetadata(DriftChecked))} DROP CONSTRAINT ${JSON.stringify(name)}`
      );
      try {
        await adapter.checkEntityConstraints([DriftChecked as EntityType]);
        expect.unreachable('漂移应当抛错');
      } catch (error) {
        expect(error).toBeInstanceOf(RxDBConstraintDriftError);
        const drift = error as RxDBConstraintDriftError;
        expect(drift.entity).toBe('DriftChecked');
        expect(drift.missing).toEqual([name]);
        expect(drift.extra).toEqual([]);
      }
      // 不自动补建：再查目录仍然没有该约束
      const result = await adapter.query<{ conname: string }>(`SELECT conname FROM pg_constraint WHERE conname = $1`, [
        name
      ]);
      expect(result.rows.length).toBe(0);
    } finally {
      await dispose();
    }
  });

  it('AC#10：库里多条声明外的 ck_ 约束 → 列「多余」', async () => {
    const { adapter, dispose } = await openDatabase();
    try {
      const table = getTableNameByMetadata(getEntityMetadata(DriftChecked));
      await adapter.query(`ALTER TABLE ${table} ADD CONSTRAINT "ck_DriftChecked_stale_0badc0de" CHECK (true)`);
      try {
        await adapter.checkEntityConstraints([DriftChecked as EntityType]);
        expect.unreachable('漂移应当抛错');
      } catch (error) {
        const drift = error as RxDBConstraintDriftError;
        expect(drift.missing).toEqual([]);
        expect(drift.extra).toEqual(['ck_DriftChecked_stale_0badc0de']);
      }
    } finally {
      await dispose();
    }
  });

  it('AC#11：只改表达式不改 name → 哈希换名 → 旧名判多余、新名判缺失', async () => {
    const { adapter, dispose } = await openDatabase();
    try {
      const name = qtyConstraintName();
      const table = getTableNameByMetadata(getEntityMetadata(DriftChecked));
      await adapter.query(`ALTER TABLE ${table} DROP CONSTRAINT ${JSON.stringify(name)}`);
      await adapter.query(
        `ALTER TABLE ${table} ADD CONSTRAINT "ck_DriftChecked_qty_positive_deadbeef" CHECK (qty > 1)`
      );
      try {
        await adapter.checkEntityConstraints([DriftChecked as EntityType]);
        expect.unreachable('漂移应当抛错');
      } catch (error) {
        const drift = error as RxDBConstraintDriftError;
        expect(drift.missing).toEqual([name]);
        expect(drift.extra).toEqual(['ck_DriftChecked_qty_positive_deadbeef']);
      }
    } finally {
      await dispose();
    }
  });

  it('评审反例：表缺失 fail-fast 报漂移并点名表缺失（与 SQLite family 同口径）', async () => {
    const { adapter, dispose } = await openDatabase();
    try {
      const name = qtyConstraintName();
      const table = getTableNameByMetadata(getEntityMetadata(DriftChecked));
      await adapter.query(`DROP TABLE ${table} CASCADE`);
      try {
        await adapter.checkEntityConstraints([DriftChecked as EntityType]);
        expect.unreachable('表缺失应当报漂移');
      } catch (error) {
        expect(error).toBeInstanceOf(RxDBConstraintDriftError);
        const drift = error as RxDBConstraintDriftError;
        expect(drift.tableMissing).toBe(true);
        expect(drift.missing).toEqual([name]);
        expect(drift.message).toContain('missing from the database catalog');
      }
    } finally {
      await dispose();
    }
  });
});

/**
 * 带条件唯一索引（uq_）、普通索引（idx_）与区间排他（ex_）的实体。
 * `EXCLUDE` 约束在 `pg_indexes` 里也有一条同名支撑索引——它不能被当成多余的 uq_。
 */
@Entity({
  name: 'DriftRanged',
  namespace: 'drift-fixtures',
  log: false,
  properties: [
    { name: 'lineId', type: PropertyType.string },
    { name: 'state', type: PropertyType.string },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  indexes: [
    { name: 'line_idx', properties: ['lineId'] },
    {
      name: 'released_line',
      properties: ['lineId'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ],
  exclusions: [{ name: 'no_overlap', equal: ['lineId'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }] }]
})
class DriftRanged extends EntityBase {}

const rangedNames = () => {
  const metadata = getEntityMetadata(DriftRanged);
  return {
    table: getTableNameByMetadata(metadata),
    unique: compileConditionalUniqueIndex(metadata, metadata.indexMap.get('released_line')!).name,
    exclusion: compileExclusionConstraint(metadata, metadata.exclusionMap.get('no_overlap')!).name
  };
};

describe('PGlite 漂移检查：条件唯一索引与区间排他（阶段 B / C）', () => {
  it('建库即一致：uq_ 索引与 ex_ 约束俱全，EXCLUDE 的支撑索引与 idx_ 不报多余（AC#16）', async () => {
    const { adapter, dispose } = await openDatabase([DriftRanged as EntityType]);
    try {
      const { unique, exclusion } = rangedNames();
      const indexes = await adapter.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'drift-fixtures' AND tablename = 'DriftRanged'`
      );
      // 支撑索引与约束同名，确实出现在 pg_indexes 里
      expect(indexes.rows.map(row => row.indexname)).toEqual(expect.arrayContaining([unique, exclusion]));
      await expect(adapter.checkEntityConstraints([DriftRanged as EntityType])).resolves.toBeUndefined();
    } finally {
      await dispose();
    }
  });

  it('AC#10：缺 uq_ 条件唯一索引 → 判缺失；reconcileEntityIndexes 不替用户补建', async () => {
    const { adapter, dispose } = await openDatabase([DriftRanged as EntityType]);
    try {
      const { unique } = rangedNames();
      await adapter.query(`DROP INDEX "drift-fixtures".${JSON.stringify(unique)}`);
      await adapter.reconcileEntityIndexes([DriftRanged as EntityType]);
      try {
        await adapter.checkEntityConstraints([DriftRanged as EntityType]);
        expect.unreachable('漂移应当抛错');
      } catch (error) {
        expect(error).toBeInstanceOf(RxDBConstraintDriftError);
        const drift = error as RxDBConstraintDriftError;
        expect(drift.missing).toEqual([unique]);
        expect(drift.extra).toEqual([]);
      }
    } finally {
      await dispose();
    }
  });

  it('AC#10：缺 ex_ 区间排他 → 判缺失；残留别的 uq_ 索引 → 判多余', async () => {
    const { adapter, dispose } = await openDatabase([DriftRanged as EntityType]);
    try {
      const { table, exclusion } = rangedNames();
      await adapter.query(`ALTER TABLE ${table} DROP CONSTRAINT ${JSON.stringify(exclusion)}`);
      await adapter.query(`CREATE UNIQUE INDEX "uq_DriftRanged_stale_0badc0de" ON ${table} ("state") WHERE false`);
      try {
        await adapter.checkEntityConstraints([DriftRanged as EntityType]);
        expect.unreachable('漂移应当抛错');
      } catch (error) {
        const drift = error as RxDBConstraintDriftError;
        expect(drift.missing).toEqual([exclusion]);
        expect(drift.extra).toEqual(['uq_DriftRanged_stale_0badc0de']);
      }
    } finally {
      await dispose();
    }
  });
});
