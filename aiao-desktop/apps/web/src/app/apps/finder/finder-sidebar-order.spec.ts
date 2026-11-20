import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DesktopData } from '../../data/desktop-data';
import { Preferences } from '../../data/preferences';
import { SystemPreference } from '../../data/system-preference.entity';
import { Toast } from '../../services/toast';
import { configureServices } from '../../testing/angular';
import { FakeDesktopData } from '../../testing/fake-desktop-data';
import { SIDEBAR } from './finder-model';
import { FinderSidebarOrder } from './finder-sidebar-order';

const KEY = 'finder:sidebar:Favourites';
const removedKey = (name: string) => `${KEY}:removed:${name}`;
const isRemoved = (value: unknown): value is true => value === true;
const names = (group: (typeof SIDEBAR)[number]) => group.items.map(([name]) => name);
const initial = names(SIDEBAR[0]);

function setup(saved?: unknown, removed: readonly string[] = []) {
  const data = new FakeDesktopData();
  const table = data.table<{ key: string; value: unknown }>(SystemPreference);
  table.seed([
    ...(saved === undefined ? [] : [{ key: KEY, value: saved }]),
    ...removed.map(name => ({ key: removedKey(name), value: true }))
  ]);
  configureServices([FinderSidebarOrder, Preferences, Toast, { provide: DesktopData, useValue: data }]);
  const order = TestBed.inject(FinderSidebarOrder);
  return {
    order,
    favourites: () => names(order.groups()[0]),
    preferences: TestBed.inject(Preferences),
    toast: TestBed.inject(Toast)
  };
}

describe('FinderSidebarOrder', () => {
  it('读取已保存的组内顺序，去掉重复和失效项，并补齐新增快捷项', async () => {
    const { order, preferences, favourites } = setup(['Downloads', 'ghost', 'Recents', 'Downloads']);
    expect(favourites()).toEqual(initial);
    await preferences.ready;
    expect(favourites()).toEqual([
      'Downloads',
      'Recents',
      ...initial.filter(name => !['Downloads', 'Recents'].includes(name))
    ]);
    expect(order.groups().slice(1)).toEqual(SIDEBAR.slice(1));
  });

  it('损坏的偏好使用默认顺序，越界、跨组和原位移动不写库', async () => {
    const { order, preferences, favourites } = setup(['Recents', 42]);
    await preferences.ready;
    const save = vi.spyOn(preferences, 'set');
    expect(favourites()).toEqual(initial);
    expect(order.move('Favourites', 'AirDrop', -1)).toBe(false);
    expect(order.move('Favourites', 'AirDrop', initial.length)).toBe(false);
    expect(order.move('Favourites', 'AirDrop', 0)).toBe(false);
    expect(order.move('Locations', 'AirDrop', 1)).toBe(false);
    expect(order.move('Missing', 'AirDrop', 1)).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('立即应用连续移动，较早的写入完成时保留最新顺序', async () => {
    const { order, preferences, favourites } = setup();
    const save = vi.spyOn(preferences, 'set');
    expect(order.move('Favourites', 'AirDrop', 1)).toBe(true);
    expect(order.move('Favourites', 'AirDrop', 2)).toBe(true);
    const expected = ['Recents', 'Desktop', 'AirDrop', ...initial.slice(3)];
    expect(favourites()).toEqual(expected);
    await save.mock.results[0].value;
    expect(favourites()).toEqual(expected);
    await save.mock.results[1].value;
    expect(save).toHaveBeenLastCalledWith(KEY, expected);
    expect(preferences.get(KEY, Array.isArray)).toEqual(expected);
  });

  it('连续移除收藏时保留原顺序和所有已移除项', async () => {
    const { order, preferences, favourites } = setup(['Desktop', 'Downloads']);
    await preferences.ready;
    const save = vi.spyOn(preferences, 'set');
    const expected = ['Downloads', ...initial.filter(name => !['Desktop', 'Downloads', 'AirDrop'].includes(name))];

    expect(order.removeFavourite('AirDrop')).toBe(true);
    expect(order.removeFavourite('Desktop')).toBe(true);
    expect(favourites()).toEqual(expected);
    await save.mock.results[0].value;
    expect(favourites()).toEqual(expected);
    await save.mock.results[1].value;
    expect(preferences.get(removedKey('AirDrop'), isRemoved)).toBe(true);
    expect(preferences.get(removedKey('Desktop'), isRemoved)).toBe(true);
    expect(preferences.get(KEY, Array.isArray)).toEqual(['Desktop', 'Downloads']);
  });

  it('读取移除记录并允许移除最后一个收藏项', async () => {
    const { order, preferences, favourites } = setup(['Downloads', 'AirDrop'], initial.slice(1));
    await preferences.ready;
    const save = vi.spyOn(preferences, 'set');

    expect(favourites()).toEqual(['AirDrop']);
    expect(order.removeFavourite('Downloads')).toBe(false);
    expect(order.removeFavourite('Macintosh HD')).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(order.removeFavourite('AirDrop')).toBe(true);
    expect(favourites()).toEqual([]);
    await save.mock.results[0].value;
    expect(favourites()).toEqual([]);
    expect(order.groups().slice(1)).toEqual(SIDEBAR.slice(1));
  });

  it('移除写入失败时恢复收藏项并提示用户', async () => {
    const { order, preferences, favourites, toast } = setup(undefined, ['Desktop']);
    await preferences.ready;
    const show = vi.spyOn(toast, 'show');
    vi.spyOn(preferences, 'set').mockRejectedValueOnce(new Error('disk full'));
    expect(order.removeFavourite('AirDrop')).toBe(true);
    expect(favourites()).not.toContain('AirDrop');
    await vi.waitFor(() => expect(favourites()).toEqual(initial.filter(name => name !== 'Desktop')));
    expect(show).toHaveBeenCalledWith('Couldn’t remove the Finder favourite.');
  });

  it('写入失败时恢复已保存的顺序并提示用户', async () => {
    const { order, preferences, favourites, toast } = setup();
    await preferences.ready;
    const show = vi.spyOn(toast, 'show');
    vi.spyOn(preferences, 'set').mockRejectedValueOnce(new Error('disk full'));
    expect(order.move('Favourites', 'AirDrop', 1)).toBe(true);
    await vi.waitFor(() => expect(favourites()).toEqual(initial));
    expect(show).toHaveBeenCalledWith('Couldn’t save the Finder sidebar order.');
  });
});
