import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { configureServices } from '../testing/angular';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { DESKTOP_APPS } from './desktop-apps';
import { DOCK_LAYOUT_KEY, DockLayoutStore } from './dock-layout';
import { DockLayout, defaultLayout } from './dock-layout-model';
import { MenuCommand, MenuEntry } from './menu';
import { Toast } from './toast';

const app = (id: string) => ({ type: 'app', id });
const divider = { type: 'divider' };
const layoutOf = (...items: readonly unknown[]) => ({ version: 1, items });

interface Options {
  /** 库里已存的 `dock:layout`；不给就是没存过。 */
  readonly stored?: unknown;
  /** 库连不上。 */
  readonly failLoad?: Error;
}

function setup({ stored, failLoad }: Options = {}) {
  const data = new FakeDesktopData();
  const table = data.table<{ id?: string; key: string; value: unknown }>(SystemPreference);
  if (stored !== undefined) table.seed([{ key: DOCK_LAYOUT_KEY, value: stored }]);
  if (failLoad) data.repository.mockRejectedValueOnce(failLoad);
  configureServices([
    DockLayoutStore,
    Preferences,
    Toast,
    { provide: DesktopData, useValue: data },
    { provide: DESKTOP_APPS, useValue: DESKTOP_APP_MANIFESTS }
  ]);
  const preferences = TestBed.inject(Preferences);
  return { store: TestBed.inject(DockLayoutStore), preferences, table, toast: TestBed.inject(Toast) };
}

/** 让已排队的微任务（读库、串行写库）都跑完。 */
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 把 items 压成 id 序列，分隔线记为 `|`。 */
const ids = (items: DockLayout['items']): string[] => items.map(item => (item.type === 'app' ? item.id : '|'));

/** 库里存着的布局（一行 `dock:layout`）。 */
const savedLayout = (table: ReturnType<typeof setup>['table']): unknown =>
  table.rows.find(row => row.key === DOCK_LAYOUT_KEY)?.value;

const defaultIds = ids(defaultLayout(DESKTOP_APP_MANIFESTS).items);

describe('DockLayoutStore 读取', () => {
  it('库还没读完时用清单的默认布局', () => {
    const { store } = setup({ stored: layoutOf(app('finder'), app('launchpad'), divider, app('trash')) });
    expect(ids(store.items())).toEqual(defaultIds);
  });

  it('没存过布局：读完后仍是默认布局，也不写库', async () => {
    const { store, preferences, table } = setup();
    await preferences.ready;
    await settle();
    expect(ids(store.items())).toEqual(defaultIds);
    expect(table.rows).toHaveLength(0);
  });

  it('已存的有效布局：读完后采用，且不重复写库', async () => {
    const stored = layoutOf(app('finder'), app('notes'), app('launchpad'), app('safari'), divider, app('trash'));
    const { store, preferences, table } = setup({ stored });
    const update = vi.spyOn(table, 'update');
    await preferences.ready;
    await settle();
    expect(ids(store.items())).toEqual(['finder', 'notes', 'launchpad', 'safari', '|', 'trash']);
    expect(update).not.toHaveBeenCalled();
  });

  it('损坏的偏好：未知与重复项丢弃、顺序保留、受保护项补回，并把修复结果写回', async () => {
    const stored = layoutOf(app('safari'), app('ghost'), app('mail'), app('safari'), divider, divider);
    const { store, preferences, table } = setup({ stored });
    await preferences.ready;
    await settle();
    const expected = ['finder', 'launchpad', 'safari', 'mail', '|', 'trash'];
    expect(ids(store.items())).toEqual(expected);
    expect(ids((savedLayout(table) as DockLayout).items)).toEqual(expected);
  });

  it('整体无法识别（不是布局）：回到默认布局并写回', async () => {
    const { store, preferences, table } = setup({ stored: 'broken' });
    await preferences.ready;
    await settle();
    expect(ids(store.items())).toEqual(defaultIds);
    expect(savedLayout(table)).toEqual(defaultLayout(DESKTOP_APP_MANIFESTS));
  });

  it('库连不上：布局保持默认，改动只留在内存里，不抛未处理的拒绝', async () => {
    const { store, preferences, table } = setup({ failLoad: new Error('db down') });
    await expect(preferences.ready).rejects.toThrow('db down');
    await settle();
    expect(store.pin('reminders')).toBe(true);
    await settle();
    expect(store.pinned('reminders')).toBe(true);
    expect(table.rows).toHaveLength(0);
  });
});

describe('DockLayoutStore 固定、取消固定与调整顺序', () => {
  async function loaded(options?: Options) {
    const context = setup(options);
    await context.preferences.ready;
    await settle();
    return context;
  }

  it('pin 把应用固定到指定槽位并落库；已固定的不重复添加，也不再写库', async () => {
    const { store, table } = await loaded();
    expect(store.pinned('reminders')).toBe(false);
    expect(store.pin('reminders', 2)).toBe(true);
    await settle();
    expect(store.pinned('reminders')).toBe(true);
    expect(ids(store.items()).slice(0, 4)).toEqual(['finder', 'launchpad', 'reminders', 'safari']);
    expect(ids((savedLayout(table) as DockLayout).items).slice(0, 4)).toEqual([
      'finder',
      'launchpad',
      'reminders',
      'safari'
    ]);

    const writes = vi.spyOn(table, 'update');
    expect(store.pin('reminders', 0)).toBe(false);
    await settle();
    expect(writes).not.toHaveBeenCalled();
    expect(ids(store.items()).filter(id => id === 'reminders')).toHaveLength(1);
  });

  it('不给槽位时固定到应用区末尾，和拖到应用区最右边的结果一致', async () => {
    const { store } = await loaded();
    store.pin('reminders');
    expect(ids(store.items()).slice(-4)).toEqual(['settings', 'reminders', '|', 'trash']);
  });

  it('unpin 取消固定可移除的应用并落库', async () => {
    const { store, table } = await loaded();
    expect(store.canUnpin('calculator')).toBe(true);
    expect(store.unpin('calculator')).toBe(true);
    await settle();
    expect(store.pinned('calculator')).toBe(false);
    expect(ids((savedLayout(table) as DockLayout).items)).not.toContain('calculator');
  });

  it.each(['finder', 'launchpad', 'trash'] as const)('%s 不可移除：unpin 被拒绝，布局和库都不变', async id => {
    const { store, table } = await loaded();
    expect(store.canUnpin(id)).toBe(false);
    expect(store.unpin(id)).toBe(false);
    await settle();
    expect(store.pinned(id)).toBe(true);
    expect(table.rows).toHaveLength(0);
  });

  it('move 调整顺序并落库，落在原位置不写库', async () => {
    const { store, table } = await loaded();
    expect(store.move('music', 2)).toBe(true);
    await settle();
    expect(ids(store.items()).slice(0, 4)).toEqual(['finder', 'launchpad', 'music', 'safari']);
    expect(ids((savedLayout(table) as DockLayout).items).slice(0, 4)).toEqual([
      'finder',
      'launchpad',
      'music',
      'safari'
    ]);

    const writes = vi.spyOn(table, 'update');
    expect(store.move('music', 2)).toBe(false);
    await settle();
    expect(writes).not.toHaveBeenCalled();
  });

  it('不能固定的应用（About This Mac）被拒绝', async () => {
    const { store } = await loaded();
    expect(store.pinnable('about')).toBe(false);
    expect(store.pin('about')).toBe(false);
    expect(store.pinnable('reminders')).toBe(true);
  });

  it('连续改动按顺序落库，最后一次为准', async () => {
    const { store, table } = await loaded();
    store.pin('reminders');
    store.pin('weather');
    store.unpin('safari');
    await settle();
    const saved = savedLayout(table) as DockLayout;
    expect(ids(saved.items)).toEqual(ids(store.items()));
    expect(ids(saved.items)).toContain('weather');
    expect(ids(saved.items)).not.toContain('safari');
    expect(table.rows.filter(row => row.key === DOCK_LAYOUT_KEY)).toHaveLength(1);
  });

  it('写库失败：提示用户，内存里的布局仍按用户的操作显示', async () => {
    const { store, table, toast } = await loaded();
    vi.spyOn(table, 'create').mockRejectedValueOnce(new Error('disk full'));
    expect(store.pin('reminders')).toBe(true);
    await settle();
    expect(store.pinned('reminders')).toBe(true);
    expect(toast.message()).toBe('Couldn’t save the Dock layout.');
  });
});

describe('DockLayoutStore 菜单项', () => {
  /** 取菜单项并断言它是可点击的命令。 */
  const command = (entry: MenuEntry): MenuCommand => {
    if (typeof entry !== 'object' || !('id' in entry)) throw new Error('应该是菜单命令');
    return entry;
  };

  it('未固定的应用显示 Add to Dock，执行后固定到应用区末尾，和拖到应用区最右边的结果一致', async () => {
    const { store, preferences } = setup();
    await preferences.ready;
    const entry = command(store.menuEntry('reminders'));
    expect(entry).toMatchObject({ id: 'add-to-dock', label: 'Add to Dock', disabled: false });
    entry.run?.();
    expect(ids(store.items()).slice(-4)).toEqual(['settings', 'reminders', '|', 'trash']);
  });

  it('已固定的可移除应用显示 Remove from Dock，执行后取消固定', async () => {
    const { store, preferences } = setup();
    await preferences.ready;
    const entry = command(store.menuEntry('calculator'));
    expect(entry).toMatchObject({ id: 'remove-from-dock', label: 'Remove from Dock', disabled: false });
    entry.run?.();
    expect(store.pinned('calculator')).toBe(false);
  });

  it.each(['finder', 'launchpad', 'trash'] as const)('%s 不可移除：Remove from Dock 置灰，执行也不会取消固定', async id => {
    const { store, preferences } = setup();
    await preferences.ready;
    const entry = command(store.menuEntry(id));
    expect(entry).toMatchObject({ id: 'remove-from-dock', disabled: true });
    entry.run?.();
    expect(store.pinned(id)).toBe(true);
  });

  it('不能固定的应用（About This Mac）Add to Dock 置灰', async () => {
    const { store, preferences } = setup();
    await preferences.ready;
    expect(command(store.menuEntry('about'))).toMatchObject({ id: 'add-to-dock', disabled: true });
  });

  it('before 在布局改动之前调用，调用方能记下改动前的状态', async () => {
    const { store, preferences } = setup();
    await preferences.ready;
    const seen: boolean[] = [];
    command(store.menuEntry('calculator', () => seen.push(store.pinned('calculator')))).run?.();
    command(store.menuEntry('reminders', () => seen.push(store.pinned('reminders')))).run?.();
    expect(seen).toEqual([true, false]);
  });
});

describe('DockLayoutStore 在库读完之前的改动', () => {
  it('读完后在已存的布局上重放，既不丢用户的操作，也不覆盖已存的布局', async () => {
    const stored = layoutOf(app('finder'), app('launchpad'), app('notes'), divider, app('trash'));
    const { store, preferences, table } = setup({ stored });
    expect(store.pin('reminders')).toBe(true);
    expect(store.pinned('reminders')).toBe(true);
    await preferences.ready;
    await settle();
    expect(ids(store.items())).toEqual(['finder', 'launchpad', 'notes', 'reminders', '|', 'trash']);
    expect(ids((savedLayout(table) as DockLayout).items)).toEqual(ids(store.items()));
  });

  it('没存过布局时，读完后用户的改动仍在并落库', async () => {
    const { store, preferences, table } = setup();
    store.unpin('calculator');
    await preferences.ready;
    await settle();
    expect(store.pinned('calculator')).toBe(false);
    expect(ids((savedLayout(table) as DockLayout).items)).not.toContain('calculator');
  });
});
