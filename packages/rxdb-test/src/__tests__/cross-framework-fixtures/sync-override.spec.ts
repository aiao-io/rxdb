/**
 * US-026 AC#12 三端夹具的自检：夹具本身必须经真实 core 路由，否则三端断言测的是夹具。
 */
import { getEntityMetadata, RxDBMissingPluginError } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  connectWithoutSyncOverride,
  defineSyncOverrideNote,
  openSyncOverrideDatabase,
  SingleTabBroadcastChannel,
  SYNC_OVERRIDE_CONTROL_ERROR_PATTERN,
  SYNC_OVERRIDE_DECLARED,
  SYNC_OVERRIDE_EFFECTIVE,
  SYNC_OVERRIDE_SEED_TITLES,
  SYNC_OVERRIDE_WRITE_TITLE,
  type SyncOverrideHarness
} from '../../cross-framework-fixtures/sync-override.js';

const ALL = { where: { combinator: 'and' as const, rules: [] } };

describe('sync-override 三端夹具', () => {
  const opened: SyncOverrideHarness[] = [];

  // 与三端 spec 同一个替身：自检跑的必须是三端真正用的那套环境
  beforeAll(() => {
    vi.stubGlobal('BroadcastChannel', SingleTabBroadcastChannel);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const open = async (): Promise<SyncOverrideHarness> => {
    const harness = await openSyncOverrideDatabase();
    opened.push(harness);
    return harness;
  };

  afterEach(async () => {
    for (const harness of opened.splice(0)) await harness.dispose();
  });

  it('实体装饰器保留 QueryCache 原声明，覆盖只存在于实例', async () => {
    const harness = await open();

    expect(getEntityMetadata(harness.Note).sync).toEqual(SYNC_OVERRIDE_DECLARED);
    expect(harness.rxdb.entitySync.resolve(harness.Note)).toEqual(SYNC_OVERRIDE_EFFECTIVE);
    expect(harness.rxdb.entitySync.resolveType(harness.Note)).toBe('local');
  });

  it('种子与写入都落在本地适配器，远端工厂一次都没被调用', async () => {
    const harness = await open();

    await new harness.Note({ title: SYNC_OVERRIDE_WRITE_TITLE }).save();
    const repository = harness.rxdb.entityManager.getRepository(harness.Note);
    const rows = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));

    expect(harness.localWriteTitles()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE]);
    expect(rows.map(row => row.title).sort()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE].sort());
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('单条更新与删除经本地仓储落地，计数随之变化', async () => {
    const harness = await open();
    const repository = harness.rxdb.entityManager.getRepository(harness.Note);
    const note = await new harness.Note({ title: SYNC_OVERRIDE_WRITE_TITLE }).save();

    note.title = '改写';
    await note.save();
    expect(harness.localWriteTitles()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE, '改写']);
    expect(await firstValueFrom(repository.count(ALL))).toBe(SYNC_OVERRIDE_SEED_TITLES.length + 1);

    await harness.rxdb.entityManager.remove(note);
    expect(await firstValueFrom(repository.count(ALL))).toBe(SYNC_OVERRIDE_SEED_TITLES.length);
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('批量保存与批量删除走本地适配器的 mutations', async () => {
    const harness = await open();
    const repository = harness.rxdb.entityManager.getRepository(harness.Note);
    const batch = [new harness.Note({ title: '批量 1' }), new harness.Note({ title: '批量 2' })];

    await harness.rxdb.entityManager.saveMany(batch);
    expect(harness.localWriteTitles()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, '批量 1', '批量 2']);
    expect(await firstValueFrom(repository.count(ALL))).toBe(SYNC_OVERRIDE_SEED_TITLES.length + 2);

    await harness.rxdb.entityManager.removeMany(batch);
    expect(await firstValueFrom(repository.count(ALL))).toBe(SYNC_OVERRIDE_SEED_TITLES.length);
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('没有覆盖的对照组：connect() 以缺 QueryCache 插件拒绝并点名实体', async () => {
    const failure = connectWithoutSyncOverride();

    await expect(failure).rejects.toBeInstanceOf(RxDBMissingPluginError);
    await expect(failure).rejects.toThrow(SYNC_OVERRIDE_CONTROL_ERROR_PATTERN);
  });

  it('每次 define 得到新类，元数据身份不共享', () => {
    expect(getEntityMetadata(defineSyncOverrideNote())).not.toBe(getEntityMetadata(defineSyncOverrideNote()));
  });
});

describe('SingleTabBroadcastChannel', () => {
  it('单标签页不回环投递：自己发的消息自己收不到', () => {
    const channel = new SingleTabBroadcastChannel();
    const listener = vi.fn();

    channel.addEventListener('message', listener);
    channel.postMessage();
    channel.removeEventListener('message', listener);
    channel.close();

    expect(listener).not.toHaveBeenCalled();
  });
});
