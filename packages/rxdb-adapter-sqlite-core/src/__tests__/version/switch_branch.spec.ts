import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  RxDB,
  SyncType,
  type EntityType,
  type RxDBEntityLocalUpdatedEventData,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase, SqliteClientLike } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteSuccessResult } from '../../sqlite-core.interface.js';
import { generateSwitchBranchSql, switch_branch } from '../../version/switch_branch.js';
import { Todo } from '../fixtures/Todo.js';

const rxdb = new RxDB({
  dbName: 'sqlite-core-switch-branch',
  entities: [Todo],
  sync: { local: { adapter: 'noop' }, type: SyncType.None }
});
rxdb.schemaManager.init();
rxdb.entityManager.init();

const successResult = (
  sql: string,
  rowsAffected = 0,
  results: SqliteSuccessResult['results'] = []
): SqliteSuccessResult => ({ sql, rowsAffected, elapsed: 1, results });

interface ExecutedCall {
  sql: string;
  params?: SQLiteCompatibleType[];
}

interface SwitchAdapterOptions {
  /** 分支切换 UPDATE 语句返回的行 */
  branchRows?: SQLiteCompatibleType[][];
  /** 分支切换 UPDATE 语句返回 undefined（覆盖 branchSwitchResult 缺失分支） */
  branchResultUndefined?: boolean;
  /** SQL 包含该片段时抛错 */
  failOn?: string;
  /** 覆盖 config.entities */
  entities?: EntityType[];
}

const branchColumns = ['__rowid', 'id', 'activated', 'local', 'remote', 'createdAt', 'updatedAt'];

const createSwitchAdapter = (options: SwitchAdapterOptions = {}) => {
  const calls: ExecutedCall[] = [];
  const dispatched: unknown[] = [];
  const client = {
    execute: async (sql: string, params?: SQLiteCompatibleType[]) => {
      calls.push({ sql, params });
      if (options.failOn && sql.includes(options.failOn)) {
        throw new Error('boom');
      }
      if (sql.includes('rxdb_branch')) {
        if (options.branchResultUndefined) return undefined as unknown as SqliteSuccessResult;
        return successResult(sql, options.branchRows?.length ?? 0, [
          { columns: branchColumns, rows: options.branchRows ?? [] }
        ]);
      }
      if (sql.trimStart().startsWith('SELECT')) {
        return successResult(sql, 1, [
          { columns: ['__rowid', 'id', 'title', 'completed'], rows: [[1, 'todo-1', 'T1', 0]] }
        ]);
      }
      return successResult(sql, 1);
    }
  } as unknown as SqliteClientLike;

  const adapter = {
    transaction: async (run: (tx: SqliteClientLike) => Promise<unknown>) => run(client),
    encryptionContext: { keyring: null, namespace: 'switch-branch-test' },
    cacheRowIdEntity: () => undefined,
    rxdb: {
      config: options.entities ? { entities: options.entities } : rxdb.config,
      schemaManager: rxdb.schemaManager,
      entityManager: rxdb.entityManager,
      context: rxdb.context,
      dispatchEvent: (event: unknown) => dispatched.push(event)
    }
  } as unknown as RxDBAdapterSqliteBase;

  return { adapter, calls, dispatched };
};

describe('generateSwitchBranchSql', () => {
  it('应为开启日志的实体重建触发器并更新 activated 标记', () => {
    const { adapter } = createSwitchAdapter();
    const sql = generateSwitchBranchSql(adapter, 'feature-1');

    expect(sql).toContain('"public$todos_insert"');
    expect(sql).toContain(`WHEN id = 'feature-1' THEN 1`);
    expect(sql).toContain(`WHERE id = 'feature-1' OR activated = 1`);
    expect(sql).toContain('RETURNING rowid as __rowid,*');
  });

  it('log: false 的实体不应生成触发器', () => {
    const { adapter } = createSwitchAdapter();
    const sql = generateSwitchBranchSql(adapter, 'main');

    // RxDBBranch 等系统表 log: false，不应重建触发器
    expect(sql).not.toContain('"rxdb$rxdb_branch_insert"');
  });

  it('branchId 含单引号时应被转义', () => {
    const { adapter } = createSwitchAdapter({ entities: [] });
    const sql = generateSwitchBranchSql(adapter, "br'1");

    expect(sql).toContain(`WHEN id = 'br''1' THEN 1`);
  });

  it('触发器生成失败时应抛出，不允许部分表静默失去历史', () => {
    const METADATA = Symbol.for('@aiao/rxdb/ɵMetadata');
    const brokenEntity = {
      [METADATA]: { name: 'SbBroken', namespace: 'public', tableName: 'sb_broken', log: true }
    } as unknown as EntityType;
    const { adapter } = createSwitchAdapter({ entities: [brokenEntity] });

    expect(() => generateSwitchBranchSql(adapter, 'main')).toThrow();
  });
});

describe('switch_branch', () => {
  it('无 actions 时应移除触发器并执行分支切换', async () => {
    const { adapter, calls, dispatched } = createSwitchAdapter();

    await switch_branch(adapter, { branchId: 'main' });

    expect(calls.some(call => call.sql.includes('DROP TRIGGER'))).toBe(true);
    expect(calls.some(call => call.sql.includes('rxdb_branch'))).toBe(true);
    // 分支切换未返回任何行时不应派发事件
    expect(dispatched).toEqual([]);
  });

  it('分支切换返回行时应派发 UPDATE 事件并翻转 inversePatch 的 activated', async () => {
    const { adapter, dispatched } = createSwitchAdapter({
      branchRows: [
        [1, 'feature', 1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'],
        [2, 'main', 0, 1, 0, '2026-01-01T00:00:00.000Z', null],
        [3, 'stale', 0, 1, 0, null, null]
      ]
    });

    await switch_branch(adapter, { branchId: 'feature' });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(EntityLocalUpdatedEvent);
    const events = (dispatched[0] as { entities: RxDBEntityLocalUpdatedEventData[] }).entities;
    expect(events).toHaveLength(3);
    expect(events[0].inversePatch).toMatchObject({ activated: 0 });
    expect(events[1].inversePatch).toMatchObject({ activated: 1 });
    // recordAt 依次回退：updatedAt → createdAt → 当前时间
    expect(events[0].recordAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));
    expect(events[1].recordAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(events[2].recordAt).toBeInstanceOf(Date);
  });

  it('分支切换语句无结果时不应派发事件', async () => {
    const { adapter, dispatched } = createSwitchAdapter({ branchResultUndefined: true });

    await switch_branch(adapter, { branchId: 'main' });

    expect(dispatched).toEqual([]);
  });

  it('携带 actions 时应执行删除/插入/更新语句并更新序列号', async () => {
    const { adapter, calls, dispatched } = createSwitchAdapter();
    const actions = {
      deletes: new Map([['public:Todo:todo-9', { patch: null, inversePatch: { title: 'old' } }]]),
      inserts: new Map([['public:Todo:todo-1', { patch: { title: 'T1' }, inversePatch: null }]]),
      updates: new Map([['public:Todo:todo-2', { patch: { title: 'T2' }, inversePatch: { title: 'T2-old' } }]]),
      updateRxDBChangeSequence: 42
    } as unknown as SwitchVersionActions;

    await switch_branch(adapter, { branchId: 'feature', actions });

    expect(calls.some(call => call.sql.startsWith('DELETE FROM "public$todos"'))).toBe(true);
    expect(calls.some(call => call.sql.includes('INTO "public$todos"'))).toBe(true);
    expect(calls.some(call => call.sql.startsWith('UPDATE "public$todos"'))).toBe(true);
    expect(calls.some(call => call.sql === 'DELETE FROM sqlite_sequence WHERE name = ?')).toBe(true);
    const seqInsert = calls.find(call => call.sql === 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)');
    expect(seqInsert?.params).toEqual(['rxdb$rxdb_change', 42]);

    // 事件顺序：分支 UPDATE（无行则跳过）→ DELETE → INSERT → UPDATE
    expect(dispatched.some(event => event instanceof EntityLocalRemovedEvent)).toBe(true);
    expect(dispatched.some(event => event instanceof EntityLocalCreatedEvent)).toBe(true);
    expect(dispatched.some(event => event instanceof EntityLocalUpdatedEvent)).toBe(true);
  });

  it('事务内失败时应包装为 switch branch failed 错误', async () => {
    const { adapter } = createSwitchAdapter({ failOn: 'DROP TRIGGER' });

    await expect(switch_branch(adapter, { branchId: 'main' })).rejects.toThrow(/switch branch main failed/);
  });
});
