/**
 * @fileoverview wa-sqlite 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 主库由本包的 {@link waSqliteFactory} 建（内存档），快照库由 {@link createWaSqliteWorktreeAdapter} 建（持久档）：
 * 持久归属的检出位放开之后要能原样再打开，`close()` / `prune()` 删的也要是真存储。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { WORKTREE_CONFORMANCE_ENTITIES, worktreeConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterEach } from 'vitest';

import { createWaSqliteWorktreeAdapter, waSqliteFactory } from './wa-sqlite-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  for (const adapter of opened.splice(0)) {
    await adapter.rxdb.disconnectAll();
    await waSqliteFactory.cleanupAdapter?.(adapter);
  }
});

worktreeConformanceSuite({
  name: 'wa-sqlite',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await waSqliteFactory.createAdapter<AdapterCleanupTarget>({
      entities: [...WORKTREE_CONFORMANCE_ENTITIES],
      plugins: [
        rxDBPluginHistory,
        (db: RxDB) => rxDBPluginWorkingTree(db, { worktrees: { adapter: createWaSqliteWorktreeAdapter } })
      ]
    });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
