/**
 * @fileoverview Electron（node:sqlite host）后端的提交侧一致性调用点（T043）。
 *
 * @remarks
 * 套件本体在 `@aiao/rxdb/testing`，六个 v1 后端各有一个这样的文件。**后端语义的断言一律不
 * 写在这里**：一旦某个后端在本地加一条「它自己的」断言，六份就开始各测各的，而这套套件存在
 * 的理由恰恰是「六个后端对同一组语义给出同一个答案」。
 *
 * 库由本包既有的 {@link electronAdapterFactory} 建，不另写一份 `new RxDB(...)`：桌面路径要走
 * 「客户端 → 协议校验 → host → `node:sqlite`」全程，连法写第二遍就意味着共享套件跑的链路与
 * 本包其余测试跑的链路可以在无人察觉的情况下分岔。工厂交还的是**适配器**，数据库取它的 `rxdb`。
 *
 * `afterAll` 里那条 {@link electronHostDeliveryErrors} 断言不违反上面那句：它断言的是**测试
 * 宿主**没有吞掉变更事件，与工作树语义无关——host 的 `onDeliveryError` 是 best-effort，不会
 * 让写入失败，因此不攒起来看一眼的话，一次送达故障会以「某条用例莫名其妙地没看到变更」的
 * 形态出现。本包每个用到这个 host 的文件都这么收尾。
 *
 * {@link stopElectronTestHost} 是必须的：host 与临时工作区按**模块**单例，而 vitest 的每个
 * 文件有自己的模块注册表——本文件不关，`os.tmpdir()` 里就留下一整个库目录。
 *
 * 契约（`suite-context.ts`）要求每次调用都交出一个**全新**实例，所以这里不复用同一个库；
 * 契约没有 teardown 钩子，于是回收落在调用点自己身上——文件级 `afterEach` 在套件内层钩子
 * 之后跑，把本条用例开过的库全部断开。
 */

import type { RxDB } from '@aiao/rxdb';
import type { AdapterCleanupTarget } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { workingTreeCommitConformanceSuite } from '@aiao/rxdb/testing';
import { afterAll, afterEach, expect } from 'vitest';

import {
  electronAdapterFactory,
  electronHostDeliveryErrors,
  stopElectronTestHost
} from './electron-adapter-factory.js';

const opened: AdapterCleanupTarget[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const adapter of pending) await adapter.rxdb.disconnectAll();
});

afterAll(() => {
  try {
    expect(electronHostDeliveryErrors()).toEqual([]);
  } finally {
    stopElectronTestHost();
  }
});

workingTreeCommitConformanceSuite({
  name: 'electron',
  createDatabase: async (): Promise<RxDB> => {
    const adapter = await electronAdapterFactory.createAdapter<AdapterCleanupTarget>();
    opened.push(adapter);
    await adapter.rxdb.workingTree.enable();
    return adapter.rxdb;
  }
});
