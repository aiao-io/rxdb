/**
 * @fileoverview 插件装配（`specs/005-us-909-session-replay/contracts/replay-plugin.md` §1、§3 末段）。
 *
 * @remarks
 * `rxdb.replay` 在 `use()` 那一刻就挂上，但只有连接纪元装起来之后成员才可用：之前与之后都抛 `not_installed`，
 * 不降级成空结果——「插件没装」与「还没有会话」是两件事，混成同一个空数组会让 UI 显示一个永远空的列表。
 */

import type { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBReplayError } from '../errors.js';
import { RxDBPluginReplay, rxDBPluginReplay } from '../plugin.js';
import { createAppDb, createRecordingDbFactory } from './fixtures/dbs.js';

// 前缀由 RxDBReplayError 自己加：调用方再写一遍就成了双前缀
const notInstalled = expect.objectContaining({
  name: 'RxDBReplayError',
  code: 'not_installed',
  message: expect.stringMatching(/^\[rxdb-plugin-replay\] (?!\[rxdb-plugin-replay\])/)
});

let app: RxDB | undefined;

afterEach(async () => {
  await app?.destroy();
  app = undefined;
});

describe('rxDBPluginReplay：装配', () => {
  it('use() 后 getPlugins("replay") 恰有一个，重复 use() 返回同一实例', () => {
    app = createAppDb();
    const { factory } = createRecordingDbFactory();

    app.use(rxDBPluginReplay, { createRecordingDb: factory });
    app.use(rxDBPluginReplay, { createRecordingDb: factory });

    const plugins = app.getPlugins('replay');
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toBeInstanceOf(RxDBPluginReplay);
  });

  it('rxdb.replay 不可写、不可枚举', () => {
    app = createAppDb();
    app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory });

    const descriptor = Object.getOwnPropertyDescriptor(app, 'replay');
    expect(descriptor).toMatchObject({ enumerable: false, writable: false, configurable: false });
  });

  it('选项非法 → use() 同步抛（构造期校验）', () => {
    app = createAppDb();

    expect(() => app?.use(rxDBPluginReplay)).toThrow(TypeError);
    expect(() =>
      app?.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory, limits: { sessionBytes: 0 } })
    ).toThrow(RangeError);
    expect(app.getPlugins('replay')).toHaveLength(0);
  });
});

describe('rxdb.replay：纪元守卫', () => {
  it('connect() 之前：成员抛 not_installed，state$ 照常给出 idle', async () => {
    app = createAppDb();
    const { factory, created } = createRecordingDbFactory();
    app.use(rxDBPluginReplay, { createRecordingDb: factory });

    await expect(app.replay.listSessions()).rejects.toThrow(notInstalled);
    await expect(app.replay.start()).rejects.toThrow(RxDBReplayError);
    await expect(app.replay.usage()).rejects.toThrow(notInstalled);
    expect(await firstValueFrom(app.replay.state$)).toEqual({ kind: 'idle' });
    expect(created).toHaveLength(0);
  });

  it('connect() 之后可用；不调存储就不建录制库（懒建）', async () => {
    app = createAppDb();
    const { factory, created } = createRecordingDbFactory();
    app.use(rxDBPluginReplay, { createRecordingDb: factory });

    await app.connect('pglite');
    expect(created).toHaveLength(0);

    expect(await app.replay.listSessions()).toEqual([]);
    expect(created).toHaveLength(1);
  });

  it('断连之后又抛 not_installed，且录制库被销毁；重连后重新建库', async () => {
    app = createAppDb();
    const { factory, created } = createRecordingDbFactory();
    app.use(rxDBPluginReplay, { createRecordingDb: factory });
    await app.connect('pglite');
    await app.replay.listSessions();

    await app.disconnectAll();

    await expect(app.replay.listSessions()).rejects.toThrow(notInstalled);
    await expect(created[0]?.connect('pglite')).rejects.toThrow(/destroyed/);

    await app.connect('pglite');
    expect(await app.replay.listSessions()).toEqual([]);
    expect(created).toHaveLength(2);
  });

  it('作用域释放时 state$ 的订阅者收到 complete', async () => {
    app = createAppDb();
    app.use(rxDBPluginReplay, { createRecordingDb: createRecordingDbFactory().factory });
    await app.connect('pglite');
    let completed = false;
    app.replay.state$.subscribe({ complete: () => (completed = true) });

    await app.disconnectAll();

    expect(completed).toBe(true);
  });
});
