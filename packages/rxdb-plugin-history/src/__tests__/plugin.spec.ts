/**
 * @fileoverview 插件装配契约
 *
 * 只测 `install()` 在宿主上接了哪几根线、断连时是否都拆干净。各子系统自身的行为
 * 有各自的用例，这里不重复——本文件关心的是**接线**，装错了的症状是「功能全在、
 * 就是没人调它」，那种毛病从子系统的用例里一条都看不出来。
 *
 * US-025 阶段 D 之后本插件只剩两根线：`versionManager` 槽位与待推数绑定。
 * 「重算待拉数」那一跳随 `refreshPullableCount` 去了 `@aiao/rxdb-plugin-sync`，
 * 对应的两条用例在那个包的同名文件里。
 */

import { RxDB, SyncType } from '@aiao/rxdb';
import type { Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { VersionManager } from '../VersionManager.js';
import { rxDBPluginHistory } from '../plugin.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

// `beforeInit` 这个钩子是为了在**装配之前**拿到 `syncState`：枢纽在 RxDB 构造器里就造好了，
// 而 scoped 插件的 `install()` 在 `init()` 里跑。晚一步打桩就只能看见绑定的结果，看不见调用。
const createDB = (beforeInit?: (rxdb: RxDB) => void): RxDB => {
  const rxdb = new RxDB({
    dbName: `plugin-spec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
  });
  const adapter = createMockAdapter(rxdb);
  rxdb.adapter('sqlite', () => adapter);
  rxdb.use(rxDBPluginHistory);
  beforeInit?.(rxdb);
  rxdb.init();
  return rxdb;
};

describe('rxDBPluginHistory 装配', () => {
  it('装上插件才有 versionManager 槽位', () => {
    const rxdb = createDB();

    expect(rxdb.versionManager).toBeInstanceOf(VersionManager);
  });

  // 绑的必须是 `init()` **之后**那一份流：`VersionManager.init()` 会重建 `HistoryManager`，
  // 绑到旧实例上的症状是界面待推数永远停在 0，而两边各自的用例都照样绿。
  it('把 versionManager 的待推数流绑到 syncState 上，断连时解绑', async () => {
    let bound: Observable<number> | undefined;
    const unbind = vi.fn<() => void>();
    const rxdb = createDB(db => {
      vi.spyOn(db.syncState, 'bindPushableCount').mockImplementation((source$: Observable<number>) => {
        bound = source$;
        return unbind;
      });
    });

    expect(bound).toBe(rxdb.versionManager.pushableCount$);
    expect(unbind).not.toHaveBeenCalled();

    await rxdb.disconnectAll();

    expect(unbind).toHaveBeenCalledOnce();
  });

  // 拆线不干净的症状是断连之后槽位还在，指着一个已 `destroy()` 的管理器：
  // 它的事件总线、订阅都拆了，再调只会抛在一条没人接的异步路径里。
  it('断连之后槽位连同管理器一起撤掉', async () => {
    const rxdb = createDB();
    const versionManager = rxdb.versionManager;
    const destroy = vi.spyOn(versionManager, 'destroy');

    await rxdb.disconnectAll();

    expect(destroy).toHaveBeenCalledOnce();
    expect(Reflect.has(rxdb, 'versionManager')).toBe(false);
  });
});
