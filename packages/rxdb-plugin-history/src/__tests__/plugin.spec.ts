/**
 * @fileoverview 插件装配契约
 *
 * 只测 `install()` 在宿主上接了哪几根线、断连时是否都拆干净。各子系统自身的行为
 * 有各自的用例，这里不重复——本文件关心的是**接线**，装错了的症状是「功能全在、
 * 就是没人调它」，那种毛病从子系统的用例里一条都看不出来。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionManager } from '../VersionManager.js';
import { rxDBPluginHistory } from '../plugin.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const createDB = (): RxDB => {
  const rxdb = new RxDB({
    dbName: `plugin-spec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(rxdb);
  rxdb.adapter('sqlite', () => adapter);
  rxdb.use(rxDBPluginHistory);
  rxdb.init();
  return rxdb;
};

describe('rxDBPluginHistory 装配', () => {
  let refreshPullableCount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refreshPullableCount = vi.fn(async () => 0);
    vi.spyOn(VersionManager.prototype, 'refreshPullableCount').mockImplementation(
      refreshPullableCount as unknown as VersionManager['refreshPullableCount']
    );
  });

  it('装上插件才有 versionManager 槽位', () => {
    const rxdb = createDB();

    expect(rxdb.versionManager).toBeInstanceOf(VersionManager);
  });

  // 远端适配器在实时订阅恢复后按 `syncState.requestPullableRefresh()` 发信号，
  // 它不认识 `VersionManager`；接住这一跳正是本插件的活。
  it('把 syncState 的重算待拉数请求接到 versionManager 上', async () => {
    const rxdb = createDB();

    rxdb.syncState.requestPullableRefresh();

    expect(refreshPullableCount).toHaveBeenCalledOnce();
    await rxdb.disconnectAll();
  });

  // 拆线不干净的症状是断连之后请求打在一个已 `destroy()` 的管理器上：
  // 它的事件总线、订阅都拆了，再调只会抛在一条没人接的异步路径里。
  it('断连之后请求不再落到已拆的 versionManager 上', async () => {
    const rxdb = createDB();
    await rxdb.disconnectAll();

    rxdb.syncState.requestPullableRefresh();

    expect(refreshPullableCount).not.toHaveBeenCalled();
  });
});
