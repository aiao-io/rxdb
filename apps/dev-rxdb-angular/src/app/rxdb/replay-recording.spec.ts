import { type IRxDBAdapter, RxDB, SyncType } from '@aiao/rxdb';
import { REPLAY_ENTITIES, RxDBPluginReplay } from '@aiao/rxdb-plugin-replay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplayRecordingDb, installReplay, replayRecordingDbName } from './replay-recording';
import { isReplayEnabled, REPLAY_ENABLED_KEY, setReplayEnabled, whenReplayEnabled } from './replay-toggle';

const BASE_HREF = '/';
// installReplay 不读 connect() 的返回值，占位即可
const ADAPTER = { name: 'sqlite-wasm' } as IRxDBAdapter;

const createAppDb = (dbName: string) =>
  new RxDB({ dbName, entities: [], sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None } });

afterEach(() => {
  window.localStorage.clear();
  delete window.__rxdbReplay;
  vi.restoreAllMocks();
});

describe('录制开关（US-909 阶段 C demo）', () => {
  it('默认关；写 1 才算开，关掉即删键', () => {
    const storage = window.localStorage;
    expect(REPLAY_ENABLED_KEY).toBe('rxdb-demo-replay-enabled');
    expect(isReplayEnabled(storage)).toBe(false);

    setReplayEnabled(storage, true);
    expect(storage.getItem(REPLAY_ENABLED_KEY)).toBe('1');
    expect(isReplayEnabled(storage)).toBe(true);

    setReplayEnabled(storage, false);
    expect(storage.getItem(REPLAY_ENABLED_KEY)).toBeNull();
    expect(isReplayEnabled(storage)).toBe(false);
  });

  it('键值不是 1 时视为关', () => {
    window.localStorage.setItem(REPLAY_ENABLED_KEY, 'true');
    expect(isReplayEnabled(window.localStorage)).toBe(false);
  });

  it('关时不调用加载函数（录制模块不进包、录制库不建）', () => {
    const load = vi.fn(async () => 'loaded');

    expect(whenReplayEnabled(window.localStorage, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('开时调用一次加载函数并返回它的 Promise', async () => {
    setReplayEnabled(window.localStorage, true);
    const load = vi.fn(async () => 'loaded');

    await expect(whenReplayEnabled(window.localStorage, load)).resolves.toBe('loaded');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('录制库与插件安装', () => {
  it('录制库名 = 应用库名 + -replay', () => {
    expect(replayRecordingDbName('aiao')).toBe('aiao-replay');
  });

  it('createReplayRecordingDb：录制实体、主线程单实例、不装插件、未 init', () => {
    const db = createReplayRecordingDb('aiao-replay', BASE_HREF, REPLAY_ENTITIES);

    // RxDB 会给库名追加版本后缀
    expect(db.config.dbName).toMatch(/^aiao-replay@/);
    expect(db.config.multiInstance).toBe(false);
    expect(db.config.entities).toEqual([...REPLAY_ENTITIES]);
    expect(db.config.sync.type).toBe(SyncType.None);
    expect(db.getPlugins('replay')).toEqual([]);
    expect(db.getPlugins('working-tree')).toEqual([]);
  });

  it('installReplay：装上插件、录制库走 <dbName>-replay，并挂页内测试 API', async () => {
    const db = createAppDb('demo');
    vi.spyOn(db, 'connect').mockResolvedValue(ADAPTER);

    const replay = await installReplay(db, { dbName: 'demo', baseHref: BASE_HREF });

    expect(replay).toBe(db.replay);
    expect(window.__rxdbReplay).toEqual({ replay, dbName: 'demo', recordingDbName: 'demo-replay' });
    const [plugin] = db.getPlugins('replay');
    expect(plugin).toBeInstanceOf(RxDBPluginReplay);
    const recordingDb = await (plugin as RxDBPluginReplay).options.createRecordingDb(REPLAY_ENTITIES);
    expect(recordingDb.config.dbName).toMatch(/^demo-replay@/);
  });

  it('installReplay 等本地适配器 connect() 兑现（插件装进纪元）后才挂页内测试 API', async () => {
    const db = createAppDb('demo');
    const connected = Promise.withResolvers<IRxDBAdapter>();
    const connect = vi.spyOn(db, 'connect').mockReturnValue(connected.promise);

    const installing = installReplay(db, { dbName: 'demo', baseHref: BASE_HREF });
    await Promise.resolve();

    expect(connect).toHaveBeenCalledWith('sqlite-wasm');
    expect(window.__rxdbReplay).toBeUndefined();
    connected.resolve(ADAPTER);
    await installing;
    expect(window.__rxdbReplay?.replay).toBe(db.replay);
  });

  it('installReplay：connect() 失败时拒绝、replayDemoReady 随之拒绝（/replay 页显示错误），不挂页内测试 API', async () => {
    vi.resetModules();
    const fresh = await import('./replay-recording');
    const db = createAppDb('demo');
    vi.spyOn(db, 'connect').mockRejectedValue(new Error('boom'));

    await expect(fresh.installReplay(db, { dbName: 'demo', baseHref: BASE_HREF })).rejects.toThrow('boom');
    await expect(fresh.replayDemoReady).rejects.toThrow('boom');
    expect(window.__rxdbReplay).toBeUndefined();
  });

  it('installReplay 重复调用返回同一门面、不重复 use()', async () => {
    const db = createAppDb('demo');
    vi.spyOn(db, 'connect').mockResolvedValue(ADAPTER);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = await installReplay(db, { dbName: 'demo', baseHref: BASE_HREF });
    const second = await installReplay(db, { dbName: 'demo', baseHref: BASE_HREF });

    expect(second).toBe(first);
    expect(db.getPlugins('replay')).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('replayDemoReady：installReplay 之后兑现为页内测试 API（/replay 页面靠它拿门面）', async () => {
    // 模块级单例：重新加载一份，免得被前面用例的 installReplay 先兑现
    vi.resetModules();
    const fresh = await import('./replay-recording');
    const db = createAppDb('demo');
    vi.spyOn(db, 'connect').mockResolvedValue(ADAPTER);

    const replay = await fresh.installReplay(db, { dbName: 'demo', baseHref: BASE_HREF });

    const api = await fresh.replayDemoReady;
    expect(api.replay).toBe(replay);
    expect(api).toEqual({ replay, dbName: 'demo', recordingDbName: 'demo-replay' });
  });
});
