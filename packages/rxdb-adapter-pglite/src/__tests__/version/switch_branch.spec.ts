import {
  encodeRxDBChangeEntityId,
  ENTITY_LOCAL_UPDATE_EVENT,
  EntityLocalUpdatedEvent,
  RxDB,
  RxDBBranch,
  RxDBEntityLocalUpdatedEventData,
  SyncType
} from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateSwitchBranchSql } from '../../version/switch_branch.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

describe('switch_branch 单元测试', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('generateSwitchBranchSql', () => {
    it('应生成包含触发器重建SQL的语句', () => {
      const sql = generateSwitchBranchSql(adapter, 'test-branch');

      // 应包含触发器SQL
      expect(sql).toContain('trigger');
      // 应包含分支更新SQL
      expect(sql).toContain('UPDATE');
      // RxDBBranch 的 tableName 为 'rxdb_branch'。
      expect(sql).toContain('rxdb_branch');
      expect(sql).toContain('RETURNING');
    });

    it('应正确转义分支ID中的单引号', () => {
      const sql = generateSwitchBranchSql(adapter, "test'branch");

      // 单引号应被转义为两个单引号
      expect(sql).toContain("test''branch");
    });

    it('应使用PostgreSQL语法 (TRUE/FALSE)', () => {
      const sql = generateSwitchBranchSql(adapter, 'test-branch');

      expect(sql).toContain('TRUE');
      expect(sql).toContain('FALSE');
      expect(sql).toContain('NOW()');
    });

    it('应使用STATEMENT_SEPARATOR分隔多条SQL', () => {
      const sql = generateSwitchBranchSql(adapter, 'test-branch');

      expect(sql).toContain('---STATEMENT_SEPARATOR---');
    });
  });

  describe('switch_branch 集成功能', () => {
    it('switchBranch方法应正确切换分支', async () => {
      // 创建分支
      await rxdb.versionManager.createBranch('feature-branch');

      // 检查初始状态
      const branches = await adapter.getRepository(RxDBBranch).find({
        where: { combinator: 'and', rules: [] }
      });
      const mainBranch = branches.find(b => b.id === 'main');
      const featureBranch = branches.find(b => b.id === 'feature-branch');

      expect(mainBranch?.activated).toBe(true);
      expect(featureBranch?.activated).toBe(false);

      // 切换到 feature-branch
      await rxdb.versionManager.switchBranch('feature-branch');

      // 重新查询确认状态
      const branchesAfter = await adapter.getRepository(RxDBBranch).find({
        where: { combinator: 'and', rules: [] }
      });
      const mainAfter = branchesAfter.find(b => b.id === 'main');
      const featureAfter = branchesAfter.find(b => b.id === 'feature-branch');

      expect(mainAfter?.activated).toBe(false);
      expect(featureAfter?.activated).toBe(true);
    });

    it('切换分支的 UPDATE 事件应携带翻转后的 inversePatch.activated 与 recordAt', async () => {
      await rxdb.versionManager.createBranch('feature-branch');

      const branchEvents: RxDBEntityLocalUpdatedEventData[] = [];
      const listener = (event: EntityLocalUpdatedEvent) => {
        for (const e of event.entities) {
          if (e.entity === 'RxDBBranch') branchEvents.push(e);
        }
      };
      rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);

      try {
        await rxdb.versionManager.switchBranch('feature-branch');
      } finally {
        rxdb.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, listener);
      }

      const featureEvent = branchEvents.find(e => e.id === 'feature-branch');
      const mainEvent = branchEvents.find(e => e.id === 'main');

      // 目标分支：激活后 activated=true，inversePatch 应还原为 false
      expect(featureEvent).toBeDefined();
      expect((featureEvent!.patch as { activated: boolean }).activated).toBe(true);
      expect((featureEvent!.inversePatch as { activated: boolean }).activated).toBe(false);
      expect(featureEvent!.recordAt).toBeDefined();

      // 原激活分支：停用后 activated=false，inversePatch 应还原为 true
      expect(mainEvent).toBeDefined();
      expect((mainEvent!.patch as { activated: boolean }).activated).toBe(false);
      expect((mainEvent!.inversePatch as { activated: boolean }).activated).toBe(true);
    });

    it('切换分支后实体写入仍记录目标分支的 change', async () => {
      await rxdb.versionManager.createBranch('feature-branch');
      await rxdb.versionManager.switchBranch('feature-branch');

      const todo = new Todo({ title: 'after-switch' });
      await todo.save();

      const changes = await adapter.query<{ branchId: string }>(
        `SELECT "branchId" FROM "rxdb"."rxdb_change"
         WHERE "entity" = 'Todo' AND "entityId" = $1
         ORDER BY id DESC`,
        [encodeRxDBChangeEntityId(todo.id)]
      );
      expect(changes.rows).toHaveLength(1);
      expect(changes.rows[0].branchId).toBe('feature-branch');
    });

    it('分支状态更新失败时回滚数据与 trigger', async () => {
      await rxdb.versionManager.createBranch('feature-branch');
      await adapter.query(`
        CREATE OR REPLACE FUNCTION "rxdb"."fail_branch_switch"()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'injected branch switch failure';
        END;
        $$ LANGUAGE plpgsql
      `);
      await adapter.query(`
        CREATE TRIGGER "fail_branch_switch_trigger"
        BEFORE UPDATE ON "rxdb"."rxdb_branch"
        FOR EACH STATEMENT EXECUTE FUNCTION "rxdb"."fail_branch_switch"()
      `);

      try {
        await expect(rxdb.versionManager.switchBranch('feature-branch')).rejects.toThrow(
          'injected branch switch failure'
        );
      } finally {
        await adapter.query(`DROP TRIGGER IF EXISTS "fail_branch_switch_trigger" ON "rxdb"."rxdb_branch"`);
        await adapter.query(`DROP FUNCTION IF EXISTS "rxdb"."fail_branch_switch"()`);
      }

      await expect(rxdb.versionManager.getCurrentBranch()).resolves.toMatchObject({ id: 'main' });

      const todo = new Todo({ title: 'after-failed-switch' });
      await todo.save();
      const changes = await adapter.query<{ branchId: string }>(
        `SELECT "branchId" FROM "rxdb"."rxdb_change"
         WHERE "entity" = 'Todo' AND "entityId" = $1
         ORDER BY id DESC`,
        [encodeRxDBChangeEntityId(todo.id)]
      );
      expect(changes.rows).toHaveLength(1);
      expect(changes.rows[0].branchId).toBe('main');
    });
  });
});
