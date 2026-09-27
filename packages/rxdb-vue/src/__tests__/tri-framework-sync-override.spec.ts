/**
 * 三端实例级同步覆盖（US-026 AC#12）—— Vue 侧。
 *
 * @remarks
 * 实体、覆盖配置、本地适配器与全部期望值来自 `@aiao/rxdb-test` 的
 * `cross-framework-fixtures/sync-override.ts`。本端只换查询入口（`useFind`）与写入入口
 * （`useAction` 包装的 `save()`）：覆盖是 core 的实例配置，三端绑定层不读、也不新增任何同步语义。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-angular/src/__tests__/tri-framework-sync-override.spec.ts`
 * - `packages/rxdb-react/src/__tests__/tri-framework-sync-override.spec.ts`
 */
import { RxDBMissingPluginError } from '@aiao/rxdb';
import {
  connectWithoutSyncOverride,
  openSyncOverrideDatabase,
  SingleTabBroadcastChannel,
  SYNC_OVERRIDE_CONTROL_ERROR_PATTERN,
  SYNC_OVERRIDE_SEED_TITLES,
  SYNC_OVERRIDE_WRITE_TITLE,
  type SyncOverrideHarness,
  type SyncOverrideNoteLike
} from '@aiao/rxdb-test';
import { mount } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { useAction, useFind } from '../index';
import { createSetupHarness } from './setup-harness';

const ALL = { where: { combinator: 'and' as const, rules: [] } };

const sortedTitles = (notes: readonly { title: string }[]): string[] => notes.map(note => note.title).sort();

const SEEDED = [...SYNC_OVERRIDE_SEED_TITLES].sort();
const AFTER_WRITE = [...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE].sort();

describe('三端实例级同步覆盖（US-026 AC#12）', () => {
  const opened: SyncOverrideHarness[] = [];
  const mounted: Array<{ unmount: () => void }> = [];

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

  /** 在组件 setup 里跑 hooks，卸载时一并退订 */
  const setup = <R>(run: () => R): R => {
    let captured: R | undefined;
    mounted.push(mount(createSetupHarness(() => (captured = run()))));
    if (captured === undefined) throw new Error('setup 未执行');
    return captured;
  };

  afterEach(async () => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    for (const harness of opened.splice(0)) await harness.dispose();
  });

  it('查询入口读到本地种子，远端适配器从未被实例化', async () => {
    const harness = await open();

    const notes = setup(() => useFind(harness.Note, ALL));

    await vi.waitFor(() => expect(sortedTitles(notes.value)).toEqual(SEEDED));
    expect(notes.error).toBeUndefined();
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('写入入口落到本地适配器，活查询随之刷新', async () => {
    const harness = await open();

    const { notes, create } = setup(() => ({
      notes: useFind(harness.Note, ALL),
      create: useAction((title: string) => new harness.Note({ title }).save())
    }));
    await vi.waitFor(() => expect(sortedTitles(notes.value)).toEqual(SEEDED));

    await create.execute(SYNC_OVERRIDE_WRITE_TITLE);

    await vi.waitFor(() => expect(sortedTitles(notes.value)).toEqual(AFTER_WRITE));
    expect(harness.localWriteTitles()).toEqual([...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE]);
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('对照组：没有覆盖时 connect() 以缺 QueryCache 插件拒绝并点名实体', async () => {
    const failure = connectWithoutSyncOverride();

    await expect(failure).rejects.toBeInstanceOf(RxDBMissingPluginError);
    await expect(failure).rejects.toThrow(SYNC_OVERRIDE_CONTROL_ERROR_PATTERN);
  });

  it('类型：查询与写入入口的类型只由实体决定，覆盖不引入任何本端配置', async () => {
    const harness = await open();

    const { notes, create } = setup(() => ({
      notes: useFind(harness.Note, ALL),
      create: useAction((title: string) => new harness.Note({ title }).save())
    }));

    expectTypeOf(notes.value).toEqualTypeOf<SyncOverrideNoteLike[]>();
    expectTypeOf(create.execute).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(create.execute).returns.resolves.toEqualTypeOf<SyncOverrideNoteLike>();
  });
});
