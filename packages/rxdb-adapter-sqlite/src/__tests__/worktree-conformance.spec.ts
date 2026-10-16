/**
 * @fileoverview sqlite 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 主库由本包的 {@link sqliteOfficialFactory} 建（内存档，历史插件由它装）。快照库平时用内存档
 * （{@link createSqliteOfficialWorktreeAdapter}）；「持久归属的检出位放开之后原样再打开」那条用例要真存储，
 * 经 `createDatabaseWithPersistentSnapshots` 换成持久档（{@link createSqliteOfficialPersistentWorktreeAdapter}：Worker 里的 OPFS）。
 * 持久档一个快照库一个专用 Worker，整套用例都那么建的话，浏览器内存涨到约四倍，覆盖率验收里四组浏览器并发时会挂死。
 * 快照库的 Worker 在用例之间统一收掉；真实存储的删除由 `drop-storage.spec.ts` 验。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginWorkingTree, type WorktreeAdapterFactory } from '@aiao/rxdb-plugin-working-tree';
import { WORKTREE_CONFORMANCE_ENTITIES, worktreeConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import {
  createSqliteOfficialPersistentWorktreeAdapter,
  createSqliteOfficialWorktreeAdapter,
  sqliteOfficialFactory,
  terminateSqliteOfficialWorktreeWorkers
} from './sqlite-official-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  for (const adapter of opened.splice(0)) {
    await adapter.rxdb.disconnectAll();
    await sqliteOfficialFactory.cleanupAdapter?.(adapter);
  }
  terminateSqliteOfficialWorktreeWorkers();
});

/** 建一个已启用提交能力、快照库由 `snapshotAdapter` 造的库。 */
const createDatabase = async (snapshotAdapter: WorktreeAdapterFactory): Promise<RxDB> => {
  const adapter = await sqliteOfficialFactory.createAdapter<AdapterCleanupTarget>({
    entities: [...WORKTREE_CONFORMANCE_ENTITIES],
    plugins: [(db: RxDB) => rxDBPluginWorkingTree(db, { worktrees: { adapter: snapshotAdapter } })]
  });
  opened.push(adapter);
  await adapter.rxdb.workingTree.enable();
  return adapter.rxdb;
};

worktreeConformanceSuite({
  name: 'sqlite',
  createDatabase: () => createDatabase(createSqliteOfficialWorktreeAdapter),
  createDatabaseWithPersistentSnapshots: () => createDatabase(createSqliteOfficialPersistentWorktreeAdapter)
});
