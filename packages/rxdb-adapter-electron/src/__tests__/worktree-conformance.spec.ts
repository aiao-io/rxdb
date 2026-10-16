/**
 * @fileoverview Electron 后端的只读检出位一致性调用点（US-313）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb-plugin-working-tree/testing`，六个 v1 后端各有一个这样的文件，断言一律不写在这里。
 * 主库由本包的 {@link electronAdapterFactory} 建，快照库由 {@link createElectronWorktreeAdapter} 建：
 * 两者连同一个测试宿主，宿主按库名各开一个文件。文件结束时核对宿主没有投递失败，再停掉宿主。
 * 历史插件不在 `plugins` 里：工厂建库时已经先装上了，再传一次只换来一条「plugin already installed」。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { WORKTREE_CONFORMANCE_ENTITIES, worktreeConformanceSuite } from '@aiao/rxdb-plugin-working-tree/testing';
import { afterAll, afterEach, expect } from 'vitest';

import {
  createElectronWorktreeAdapter,
  electronAdapterFactory,
  electronHostDeliveryErrors,
  stopElectronTestHost
} from './electron-adapter-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  for (const adapter of opened.splice(0)) await adapter.rxdb.disconnectAll();
});

afterAll(() => {
  try {
    expect(electronHostDeliveryErrors()).toEqual([]);
  } finally {
    stopElectronTestHost();
  }
});

worktreeConformanceSuite({
  name: 'electron',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await electronAdapterFactory.createAdapter<AdapterCleanupTarget>({
      entities: [...WORKTREE_CONFORMANCE_ENTITIES],
      plugins: [(db: RxDB) => rxDBPluginWorkingTree(db, { worktrees: { adapter: createElectronWorktreeAdapter } })]
    });
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
