/**
 * @fileoverview sqlite 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 主库由本包的 {@link sqliteOfficialFactory} 建，快照库由 {@link createSqliteOfficialWorktreeAdapter} 建：两者是同一份非持久档连法，
 * 每个适配器实例一个独立的库。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { WORKTREE_CONFORMANCE_ENTITIES, worktreeConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import { createSqliteOfficialWorktreeAdapter, sqliteOfficialFactory } from './sqlite-official-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  for (const adapter of opened.splice(0)) {
    await adapter.rxdb.disconnectAll();
    await sqliteOfficialFactory.cleanupAdapter?.(adapter);
  }
});

worktreeConformanceSuite({
  name: 'sqlite',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await sqliteOfficialFactory.createAdapter<AdapterCleanupTarget>({
      entities: [...WORKTREE_CONFORMANCE_ENTITIES],
      plugins: [
        rxDBPluginHistory,
        (db: RxDB) => rxDBPluginWorkingTree(db, { worktrees: { adapter: createSqliteOfficialWorktreeAdapter } })
      ]
    });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
