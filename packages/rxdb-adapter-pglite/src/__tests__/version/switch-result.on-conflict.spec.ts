/**
 * @fileoverview PGL-010：upsert 的 ON CONFLICT 列集合必须与实际 INSERT 的物理列一致
 *
 * `generateOnConflictClause` 只遍历 `propertyMap`：
 * - 外键物理列只存在于 `relationMap` → 冲突行的关联身份不会被恢复
 * - 只有 id/createdAt/createdBy 的实体 → 生成空 `DO UPDATE SET`，PG 语法错误
 */
import {
  Entity,
  EntityBase,
  PropertyType,
  RelationKind,
  RxDB,
  type SwitchVersionActions,
  type SwitchVersionChange,
  SyncType
} from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { convertSwitchResultToSql } from '../../version/switch-result.utils.js';
import { generateDbName } from '../test-utils.js';

const change = (patch: object | null, inversePatch: object | null = null): SwitchVersionChange => ({
  patch,
  inversePatch
});

@Entity({
  name: 'ConflictOwner',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [{ name: 'items', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'ConflictItem', mappedProperty: 'owner' }]
})
class ConflictOwner extends EntityBase {
  name!: string;
}

@Entity({
  name: 'ConflictItem',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'ConflictOwner',
      mappedProperty: 'items',
      nullable: true
    }
  ]
})
class ConflictItem extends EntityBase {
  title!: string;
  ownerId?: string;
}

/** 只有基类字段：id / createdAt / createdBy / updatedAt … 之外没有任何业务列 */
@Entity({ name: 'ConflictBare', properties: [] })
class ConflictBare extends EntityBase {}

describe('PGL-010 ON CONFLICT 列集合', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      context: { userId: 'userId' },
      dbName: generateDbName(),
      entities: [ConflictOwner, ConflictItem, ConflictBare],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const upsertSqlFor = async (key: string, patch: object): Promise<string> => {
    const actions: SwitchVersionActions = {
      deletes: new Map(),
      inserts: new Map([[key, change(patch)]]),
      updates: new Map()
    };
    const result = await convertSwitchResultToSql(adapter, actions);
    expect(result.inserts).toHaveLength(1);
    return result.inserts[0].sql;
  };

  it('外键列必须出现在 DO UPDATE SET 里', async () => {
    const sql = await upsertSqlFor('public:ConflictItem:4e1f6f7c-0000-4000-8000-0000000000c1', {
      title: 'restored',
      ownerId: '4e1f6f7c-0000-4000-8000-000000000001'
    });

    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(sql).toContain('"ownerId" = EXCLUDED."ownerId"');
  });

  // 「更新列必须来自实际 INSERT 的物理列集合」——旧实现从 propertyMap 另算一份，
  // 于是 SET 里会出现本次根本没写入的列（`updatedBy`）。
  //
  // 注：空 `DO UPDATE SET` 那条分支**当前不可达** —— `EntityBase` 总会写入 `updatedAt`，
  // 更新列集合不会为空。`DO NOTHING` 的处理仍保留为防御，但没有对应的红测试。
  it('DO UPDATE SET 只包含本次实际写入的列', async () => {
    const sql = await upsertSqlFor('public:ConflictBare:4e1f6f7c-0000-4000-8000-0000000000b1', {});

    const insertedColumns = /\(([^)]*)\)\s*VALUES/i
      .exec(sql)![1]
      .split(',')
      .map(column => column.trim().replaceAll('"', ''));
    const setColumns = [...sql.matchAll(/"([^"]+)" = EXCLUDED\./g)].map(match => match[1]);

    expect(setColumns.length).toBeGreaterThan(0);
    expect(insertedColumns).toEqual(expect.arrayContaining(setColumns));
    expect(setColumns).not.toContain('updatedBy');
  });

  it('生成的 upsert SQL 必须真的能在库上执行两次（第二次命中冲突）', async () => {
    const sql = await upsertSqlFor('public:ConflictBare:4e1f6f7c-0000-4000-8000-0000000000b2', {});
    const statements = sql.split('---STATEMENT_SEPARATOR---').filter(statement => statement.trim());
    expect(statements).toHaveLength(1);

    // 用适配器自己建好的库执行：表结构、trigger 都是真实的
    await expect(adapter.internalQuery(statements[0])).resolves.toBeDefined();
    // 第二次走 ON CONFLICT 分支 —— 空 DO UPDATE SET 在这里就是语法错误
    await expect(adapter.internalQuery(statements[0])).resolves.toBeDefined();
  });
});
