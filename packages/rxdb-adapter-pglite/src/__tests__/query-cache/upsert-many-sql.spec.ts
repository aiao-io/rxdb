/**
 * PGL-012：`buildQueryCacheUpsertStatements` 的语句形态。
 *
 * 与 `query-cache-metadata.spec.ts` 分工：那边真机执行、验证数据落到正确的库和列；
 * 这边直接断言生成的 SQL —— 有些契约在真机上表达不出来，
 * 例如「无可更新列必须发 DO NOTHING」：PG 的 NOT NULL 检查先于冲突判定，
 * EntityBase 实体永远走不到那个分支，只能在语句层面锁定。
 */
import { Entity, EntityBase, getEntityMetadata, PropertyType, RelationKind, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { getTableNameByMetadata } from '../../pglite.utils.js';
import type { QueryCacheTarget } from '../../query-cache/query_cache_target.js';
import { buildQueryCacheUpsertStatements } from '../../query-cache/upsert_many_sql.js';

@Entity({
  name: 'QcUnitTeam',
  tableName: 'qc_unit_teams',
  properties: [{ name: 'teamName', type: PropertyType.string, columnName: 'team_name' }]
})
class QcUnitTeam extends EntityBase {
  teamName!: string;
}

@Entity({
  name: 'QcUnitMember',
  tableName: 'qc_unit_members',
  properties: [
    { name: 'nickName', type: PropertyType.string, columnName: 'nick_name' },
    { name: 'score', type: PropertyType.integer, columnName: 'member_score', nullable: true }
  ],
  relations: [
    {
      name: 'team',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'QcUnitTeam',
      mappedProperty: 'members',
      columnName: 'team_id'
    }
  ]
})
class QcUnitMember extends EntityBase {
  nickName!: string;
  score?: number;
  teamId!: string;
}

/**
 * 只有主键、没有任何其他列的实体。
 *
 * @remarks
 * 专供「无可更新列 → DO NOTHING」那条用例：`EntityBase` 的子类永远带
 * `createdAt` / `updatedAt`，一行带齐必填列之后必然有可更新列，走不到 DO NOTHING 那一支；
 * 而故意不带它们的行会先被列契约（US-024）拦下，同样到不了语句生成。
 * 所以这里不继承 `EntityBase`，自己声明主键。
 */
@Entity({
  name: 'QcUnitIdOnly',
  tableName: 'qc_unit_id_only',
  properties: [{ name: 'id', type: PropertyType.uuid, primary: true, readonly: true }]
})
class QcUnitIdOnly {
  id!: string;
}

/** 远端行必带的 `EntityBase` 非空列（US-024 的列契约）。 */
const baseColumns = {
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z'
};

const targetOf = (EntityClass: EntityType): QueryCacheTarget => {
  const metadata = getEntityMetadata(EntityClass);
  return { entityName: metadata.name, metadata, tableName: getTableNameByMetadata(metadata), idColumn: 'id' };
};

describe('PGL-012 buildQueryCacheUpsertStatements', () => {
  it('列名走 propertyMap，值全部参数化', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      { ...baseColumns, id: 'm1', nickName: '阿花', score: 9, teamId: 't1' }
    ]);

    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('INSERT INTO "public"."qc_unit_members"');
    expect(statements[0].sql).toContain('"nick_name"');
    expect(statements[0].sql).toContain('"member_score"');
    // 属性名不得作为标识符出现在 SQL 里（`"member_score"` 本身以 `score"` 结尾，
    // 所以这里必须比对带引号的完整标识符，不能用裸子串）
    expect(statements[0].sql).not.toContain('nickName');
    expect(statements[0].sql).not.toContain('"score"');
    // 值一律参数化，不内联
    expect(statements[0].sql).not.toContain('阿花');
    expect(statements[0].params).toEqual(expect.arrayContaining(['阿花', 9, 'm1']));
  });

  it('外键列名也走 relation 映射', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      { ...baseColumns, id: 'm1', nickName: '阿花', teamId: 't1' }
    ]);

    expect(statements[0].sql).toContain('"team_id"');
    expect(statements[0].sql).not.toContain('teamId');
    expect(statements[0].params).toContain('t1');
  });

  it('异构行按各自的列集合分组，互不截断', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      { ...baseColumns, id: 'm1', nickName: '只有名字', teamId: 't1' },
      { ...baseColumns, id: 'm2', nickName: '有分数', score: 5, teamId: 't1' },
      { ...baseColumns, id: 'm3', nickName: '也只有名字', teamId: 't1' }
    ]);

    // 两种列集合 → 两条语句；同列集合的两行合并进同一条
    expect(statements).toHaveLength(2);
    const withScore = statements.find(statement => statement.sql.includes('"member_score"'));
    const withoutScore = statements.find(statement => !statement.sql.includes('"member_score"'));
    expect(withScore?.params).toContain(5);
    expect(withoutScore?.params).toEqual(expect.arrayContaining(['m1', 'm3']));
  });

  it('无可更新列时发 DO NOTHING，绝不生成空的 DO UPDATE SET', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitIdOnly), [{ id: 'm1' }]);

    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('ON CONFLICT ("id") DO NOTHING');
    expect(statements[0].sql).not.toContain('DO UPDATE SET');
  });

  it('有可更新列时排除主键列，其余走 EXCLUDED', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      { ...baseColumns, id: 'm1', nickName: '阿花', teamId: 't1' }
    ]);

    expect(statements[0].sql).toContain('ON CONFLICT ("id") DO UPDATE SET ');
    expect(statements[0].sql).toContain('"nick_name" = EXCLUDED."nick_name"');
    expect(statements[0].sql).not.toContain('"id" = EXCLUDED."id"');
  });

  it('未知键 fail-fast，指名实体与该键', async () => {
    // 行先带齐必填列：否则列契约（US-024）会在键名白名单之前抛错，这条用例就测不到未知键
    await expect(
      buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
        { ...baseColumns, id: 'm1', nickName: '阿花', teamId: 't1', bogus: 1 }
      ])
    ).rejects.toThrow(/QcUnitMember[\s\S]*bogus|bogus[\s\S]*QcUnitMember/);
  });

  it('注入形状的键不会被拼进 SQL', async () => {
    const injected = `x") VALUES ('pwned') --`;
    await expect(
      buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
        { ...baseColumns, id: 'm1', nickName: '阿花', teamId: 't1', [injected]: 1 }
      ])
    ).rejects.toThrow(/QcUnitMember/);
  });

  it('关系另一端的实体同样按自己的 metadata 生成语句', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitTeam), [
      { ...baseColumns, id: 't1', teamName: '一队' }
    ]);

    expect(statements[0].sql).toContain('INSERT INTO "public"."qc_unit_teams"');
    expect(statements[0].sql).toContain('"team_name"');
    expect(statements[0].params).toContain('一队');
  });

  // 外键列有三种等价写法，契约（US-024）对三种一律放行，落地路径就必须一律认。
  // 少认哪一种，那种写法的远端行会被契约放行、再在 `assertKnownKeys` 判成未知键 ——
  // 拒掉的是一行**原本能一字不差落进 `team_id`** 的数据。
  it.each(['team', 'teamId', 'team_id'])('外键列三种写法都落进物理列：%s', async key => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      { ...baseColumns, id: 'm1', nickName: '阿花', [key]: 't1' }
    ]);

    expect(statements[0].sql).toContain('"team_id"');
    expect(statements[0].sql).not.toContain('"team"');
    expect(statements[0].sql).not.toContain('teamId');
    expect(statements[0].params).toContain('t1');
  });

  // 同一行里混用两种写法必须 fail-fast。归一之前，两种写法在 `transformEntityValueToSql` 里
  // 按 `Object.keys` 顺序后者覆盖前者：落地的是哪个值取决于键的枚举顺序，且没有任何信号。
  // 两个值不同时这是数据错误，不是风格问题（sqlite 侧同款判据在
  // `RxDBAdapterSqliteBase.ts` 的 `assert_single_spelling_per_column`，那边 SQLite 连重复列名
  // 都不报，只留第一个）。
  it.each([
    ['外键两种写法', { teamId: 't1', team_id: 't2' }, 'team_id'],
    ['属性名与物理列名', { nickName: '阿花', nick_name: '阿猫' }, 'nick_name']
  ])('同一个列混用两种写法时 fail-fast，不静默取一个：%s', async (_label, extra, column) => {
    await expect(
      buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
        { ...baseColumns, id: 'm1', nickName: '阿花', teamId: 't1', ...extra }
      ])
    ).rejects.toThrow(new RegExp(`QcUnitMember[\\s\\S]*"${column}" twice`));
  });

  it('物理列名写法也被接受（远端 select(*) 的返回形态）', async () => {
    const statements = await buildQueryCacheUpsertStatements(targetOf(QcUnitMember), [
      // `createdAt` / `updatedAt` 没写 columnName，物理列名与属性名同形
      { ...baseColumns, id: 'm1', nick_name: '列名写法', team_id: 't1' }
    ]);

    expect(statements[0].sql).toContain('"nick_name"');
    expect(statements[0].params).toContain('列名写法');
  });
});
