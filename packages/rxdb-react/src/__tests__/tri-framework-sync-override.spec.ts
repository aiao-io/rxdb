/**
 * 三端实例级同步覆盖（US-026 AC#12）—— React 侧。
 *
 * @remarks
 * 实体、覆盖配置、本地适配器与全部期望值来自 `@aiao/rxdb-test` 的
 * `cross-framework-fixtures/sync-override.ts`。本端只换查询入口（`useFind`）与写入入口
 * （`useAction` 包装的 `save()`）：覆盖是 core 的实例配置，三端绑定层不读、也不新增任何同步语义。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-angular/src/__tests__/tri-framework-sync-override.spec.ts`
 * - `packages/rxdb-vue/src/__tests__/tri-framework-sync-override.spec.ts`
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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { useAction, useFind } from '../index';

const ALL = { where: { combinator: 'and' as const, rules: [] } };

const sortedTitles = (notes: readonly { title: string }[]): string[] => notes.map(note => note.title).sort();

const SEEDED = [...SYNC_OVERRIDE_SEED_TITLES].sort();
const AFTER_WRITE = [...SYNC_OVERRIDE_SEED_TITLES, SYNC_OVERRIDE_WRITE_TITLE].sort();

describe('三端实例级同步覆盖（US-026 AC#12）', () => {
  const opened: SyncOverrideHarness[] = [];

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
    cleanup();
    for (const harness of opened.splice(0)) await harness.dispose();
  });

  it('查询入口读到本地种子，远端适配器从未被实例化', async () => {
    const harness = await open();

    const { result } = renderHook(() => useFind(harness.Note, ALL));

    await waitFor(() => expect(sortedTitles(result.current.value)).toEqual(SEEDED));
    expect(result.current.error).toBeUndefined();
    expect(harness.remoteFactoryCalls()).toBe(0);
  });

  it('写入入口落到本地适配器，活查询随之刷新', async () => {
    const harness = await open();

    const { result } = renderHook(() => ({
      notes: useFind(harness.Note, ALL),
      create: useAction((title: string) => new harness.Note({ title }).save())
    }));
    await waitFor(() => expect(sortedTitles(result.current.notes.value)).toEqual(SEEDED));

    await act(() => result.current.create.execute(SYNC_OVERRIDE_WRITE_TITLE));

    await waitFor(() => expect(sortedTitles(result.current.notes.value)).toEqual(AFTER_WRITE));
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

    const { result } = renderHook(() => ({
      notes: useFind(harness.Note, ALL),
      create: useAction((title: string) => new harness.Note({ title }).save())
    }));

    expectTypeOf(result.current.notes.value).toEqualTypeOf<SyncOverrideNoteLike[]>();
    expectTypeOf(result.current.create.execute).parameters.toEqualTypeOf<[string]>();
    expectTypeOf(result.current.create.execute).returns.resolves.toEqualTypeOf<SyncOverrideNoteLike>();
  });
});
