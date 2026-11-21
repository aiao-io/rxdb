import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cycleConstraintDdlForRemotePg } from '../src/resolve/cycle-constraint-ddl.js';
import { createBomPgSchema, createLocalPgFixture, type LocalPgFixture } from './local-pg.fixture.js';

interface Edge {
  lineId: string;
  childItemId: string;
}

interface Pair {
  forward: Edge;
  reverse: Edge;
  parentItemId: string;
}

const insertEdge = (client: Client, edge: Edge, direction = 'consume') =>
  client.query(
    'INSERT INTO bom.bom_line_occurrence (id, "lineId", "childItemId", "flowDirection") VALUES ($1, $2, $3, $4)',
    [randomUUID(), edge.lineId, edge.childItemId, direction]
  );

const makePair = async (
  client: Client,
  bomType = 'ebom',
  orgId = 'X',
  reverseScope = { bomType, orgId }
): Promise<Pair> => {
  const items = [randomUUID(), randomUUID()];
  const revisions = [randomUUID(), randomUUID()];
  const headers = [randomUUID(), randomUUID()];
  const lines = [randomUUID(), randomUUID()];
  for (const index of [0, 1]) {
    await client.query('INSERT INTO bom.item VALUES ($1)', [items[index]]);
    await client.query('INSERT INTO bom.item_revision VALUES ($1, $2)', [revisions[index], items[index]]);
    await client.query('INSERT INTO bom.bom_header VALUES ($1, $2, $3, $4)', [
      headers[index],
      revisions[index],
      index === 0 ? bomType : reverseScope.bomType,
      index === 0 ? orgId : reverseScope.orgId
    ]);
    await client.query('INSERT INTO bom.bom_line VALUES ($1, $2)', [lines[index], headers[index]]);
  }
  return {
    forward: { lineId: lines[0], childItemId: items[1] },
    reverse: { lineId: lines[1], childItemId: items[0] },
    parentItemId: items[0]
  };
};

const waitForAdvisoryLock = async (observer: Client, pid: number): Promise<void> => {
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    const result = await observer.query<{ waiting: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND locktype = 'advisory' AND NOT granted) AS waiting",
      [pid]
    );
    if (result.rows[0].waiting) return;
  }
  throw new Error(`连接 ${pid} 没有进入 advisory lock 等待`);
};

const assertAcyclic = async (client: Client): Promise<void> => {
  const result = await client.query<{ cycles: string }>(`
    WITH RECURSIVE edges AS (
      SELECT h."bomType", h."orgId", r."itemId" AS parent_id, o."childItemId" AS child_id
      FROM bom.bom_line_occurrence o JOIN bom.bom_line l ON l.id = o."lineId"
      JOIN bom.bom_header h ON h.id = l."headerId"
      JOIN bom.item_revision r ON r.id = h."parentRevisionId"
      WHERE o."flowDirection" = 'consume'
    ), reach AS (
      SELECT * FROM edges
      UNION
      SELECT r."bomType", r."orgId", r.parent_id, e.child_id FROM reach r
      JOIN edges e ON e.parent_id = r.child_id AND e."bomType" = r."bomType" AND e."orgId" = r."orgId"
    ) SELECT count(*) AS cycles FROM reach WHERE parent_id = child_id
  `);
  expect(result.rows[0].cycles).toBe('0');
};

describe('US-509 AC#13：真实 PostgreSQL 多连接环约束', () => {
  let fixture: LocalPgFixture;
  let admin: Client;
  let first: Client;
  let second: Client;

  beforeAll(async () => {
    fixture = await createLocalPgFixture();
    admin = await fixture.connect();
    first = await fixture.connect();
    second = await fixture.connect();
  });

  afterAll(async () => {
    await fixture?.stop();
  });

  beforeEach(async () => {
    await Promise.all([first.query('ROLLBACK'), second.query('ROLLBACK')]);
    await createBomPgSchema(admin);
  });

  it('导出 DDL 原样部署到 bom schema，不依赖 search_path 或同义列', async () => {
    await expect(admin.query(cycleConstraintDdlForRemotePg())).resolves.toBeDefined();
    const pair = await makePair(admin);
    await expect(insertEdge(admin, pair.forward)).resolves.toBeDefined();
  });

  it('导出批次保留调用方事务，回滚也撤销派生表和约束安装', async () => {
    await first.query('BEGIN');
    const before = await first.query('SELECT txid_current() AS id');
    await first.query(cycleConstraintDdlForRemotePg());
    const after = await first.query('SELECT txid_current() AS id');
    expect(after.rows).toEqual(before.rows);
    await first.query('ROLLBACK');
    expect((await admin.query("SELECT to_regclass('bom.bom_reach') AS table_name")).rows).toEqual([
      { table_name: null }
    ]);
  });

  it('Read Committed 等锁后重检，只允许一条反向边提交', async () => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin);
    const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await first.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await second.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await insertEdge(first, pair.forward);
    const pending = insertEdge(second, pair.reverse).then(
      () => null,
      (error: unknown) => error
    );
    await waitForAdvisoryLock(admin, secondPid.rows[0].pid);
    await first.query('COMMIT');
    expect(await pending).toMatchObject({ code: 'P0001', message: expect.stringContaining('rxdb:bom_cycle:') });
    await second.query('ROLLBACK');
    expect((await admin.query('SELECT count(*) AS count FROM bom.bom_line_occurrence')).rows[0].count).toBe('1');
    await assertAcyclic(admin);
  });

  it.each(['REPEATABLE READ', 'SERIALIZABLE'])('%s 提前建立快照后明确拒绝反向边', async isolation => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin);
    await first.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await first.query('SELECT count(*) FROM bom.bom_line_occurrence');
    await insertEdge(second, pair.forward);
    await expect(insertEdge(first, pair.reverse)).rejects.toMatchObject({
      code: 'P0001',
      message: `rxdb:bom_cycle:isolation:${isolation.toLowerCase()}`
    });
    await first.query('ROLLBACK');
    await assertAcyclic(admin);
  });

  it.each(['REPEATABLE READ', 'SERIALIZABLE'])('%s 的拓扑UPDATE和DELETE同样在锁前拒绝', async isolation => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin);
    await insertEdge(admin, pair.forward);
    for (const statement of [
      'UPDATE bom.bom_line_occurrence SET "flowDirection" = \'by_product\' WHERE "lineId" = $1',
      'DELETE FROM bom.bom_line_occurrence WHERE "lineId" = $1'
    ]) {
      await first.query(`BEGIN ISOLATION LEVEL ${isolation}`);
      await first.query('SELECT count(*) FROM bom.bom_line_occurrence');
      await expect(first.query(statement, [pair.forward.lineId])).rejects.toMatchObject({
        code: 'P0001',
        message: `rxdb:bom_cycle:isolation:${isolation.toLowerCase()}`
      });
      await first.query('ROLLBACK');
    }
    expect((await admin.query('SELECT count(*) AS count FROM bom.bom_reach')).rows[0].count).toBe('1');
    await assertAcyclic(admin);
  });

  it('Read Committed删除与反向插入按同一作用域锁串行，提交后闭包只含新方向', async () => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin);
    await insertEdge(admin, pair.forward);
    const secondPid = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await first.query('BEGIN');
    await second.query('BEGIN');
    await first.query('DELETE FROM bom.bom_line_occurrence WHERE "lineId" = $1', [pair.forward.lineId]);
    const pending = insertEdge(second, pair.reverse);
    await waitForAdvisoryLock(admin, secondPid.rows[0].pid);
    await first.query('COMMIT');
    await expect(pending).resolves.toBeDefined();
    await second.query('COMMIT');
    const reach = await admin.query('SELECT "ancestorItemId", "descendantItemId" FROM bom.bom_reach');
    expect(reach.rows).toEqual([
      { ancestorItemId: pair.forward.childItemId, descendantItemId: pair.reverse.childItemId }
    ]);
    await assertAcyclic(admin);
  });

  it('跨作用域交叉取锁时 PostgreSQL 中止一个死锁事务，各作用域仍无环', async () => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const x = await makePair(admin, 'ebom', 'X');
    const y = await makePair(admin, 'mbom', 'Y');
    const firstPid = await first.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    await first.query('BEGIN');
    await second.query('BEGIN');
    await insertEdge(first, x.forward);
    await insertEdge(second, y.forward);
    const firstPending = insertEdge(first, y.reverse).then(
      () => null,
      (error: unknown) => error
    );
    await waitForAdvisoryLock(admin, firstPid.rows[0].pid);
    const secondPending = insertEdge(second, x.reverse).then(
      () => null,
      (error: unknown) => error
    );
    const outcomes = await Promise.all([firstPending, secondPending]);
    const failures = outcomes.filter(outcome => outcome !== null);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ code: '40P01' });
    await first.query(outcomes[0] === null ? 'COMMIT' : 'ROLLBACK');
    await second.query(outcomes[1] === null ? 'COMMIT' : 'ROLLBACK');
    await assertAcyclic(admin);
  });

  it('自环拒绝，非 consume 反向边允许，改成 consume 时重新检查', async () => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin);
    await expect(
      insertEdge(admin, { lineId: pair.forward.lineId, childItemId: pair.parentItemId })
    ).rejects.toMatchObject({
      message: expect.stringContaining('rxdb:bom_cycle:')
    });
    await insertEdge(admin, pair.forward);
    await insertEdge(admin, pair.reverse, 'by_product');
    await expect(
      admin.query('UPDATE bom.bom_line_occurrence SET "flowDirection" = $1 WHERE "lineId" = $2', [
        'consume',
        pair.reverse.lineId
      ])
    ).rejects.toMatchObject({ message: expect.stringContaining('rxdb:bom_cycle:') });
    await assertAcyclic(admin);
  });

  it.each([
    ['mbom', 'X'],
    ['ebom', 'Y']
  ])('作用域 %s/%s 的反向边与 ebom/X 相互独立', async (bomType, orgId) => {
    await admin.query(cycleConstraintDdlForRemotePg());
    const pair = await makePair(admin, 'ebom', 'X', { bomType, orgId });
    await expect(insertEdge(admin, pair.forward)).resolves.toBeDefined();
    await expect(insertEdge(admin, pair.reverse)).resolves.toBeDefined();
    await assertAcyclic(admin);
  });
});
