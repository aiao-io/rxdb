/**
 * US-026 AC#12 三端夹具的自检：夹具本身必须经真实 core 路由，否则三端断言测的是夹具。
 */
import { getEntityMetadata, RxDBMissingPluginError } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  connectWithoutSyncOverride,
  defineSyncOverrideNote,
  openSyncOverrideDatabase,
  SYNC_OVERRIDE_CONTROL_ERROR_PATTERN,
  SYNC_OVERRIDE_DECLARED,
  SYNC_OVERRIDE_EFFECTIVE,
  SYNC_OVERRIDE_SEED_TITLES,
  SYNC_OVERRIDE_WRITE_TITLE,
  type SyncOverrideHarness
} from '../../cross-framework-fixtures/sync-override.js';

describe('sync-override 三端夹具', () => {
  const opened: SyncOverrideHarness[] = [];

  afterEach(async () => {
    for (const harness of opened.splice(0)) await harness.dispose();
  });

  it('实体装饰器保留 QueryCache 原声明，覆盖只存在于实例', async () => {
    const harness = await openSyncOverrideDatabase();
    opened.push(harness);

    expect(getEntityMetadata(harness.Note).sync).toEqual(SYNC_OVERRIDE_DECLARED);
    expect(harness.rxdb.entitySync.resolve(harness.Note)).toEqual(SYNC_OVERRIDE_EFFECTIVE);
    expect(harness.rxdb.entitySync.resolveType(harness.Note)).toBe('local');
  });

  it('种子与写入都落在本地适配器，远端工厂一次都没被调用', async () => {
    const harness = await openSyncOverrideDatabase();
    opened.push(harness);

    await new harness.Note({ title: SYNC_OVERRIDE_WRITE_TITLE }).save();
    const repository = harness.rxdb.entityManager.getRepository(harness.Note);
    const rows = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));

    expect(harness.localWriteTitles()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE]);
    expect(rows.map(row => row.title).sort()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE].sort());
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
