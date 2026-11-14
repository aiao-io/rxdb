import { ErrorHandler, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { stubLocks } from '../testing/browser';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { FakeChannelHub, FakeLifecycle } from '../testing/fake-tab-sync';
import { DesktopData } from './desktop-data';
import { Preferences } from './preferences';
import { SystemPreference } from './system-preference.entity';
import { TabSync } from './tab-sync';

const isNumber = (value: unknown): value is number => typeof value === 'number';
const isString = (value: unknown): value is string => typeof value === 'string';

interface Options {
  readonly rows?: readonly { readonly key: string; readonly value: unknown }[];
  readonly failLoad?: Error;
}

function setup({ rows = [], failLoad }: Options = {}) {
  const data = new FakeDesktopData();
  const table = data.table<{ id?: string; key: string; value: unknown }>(SystemPreference);
  table.seed(rows);
  if (failLoad) data.repository.mockRejectedValueOnce(failLoad);
  configureServices([Preferences, { provide: DesktopData, useValue: data }]);
  return { preferences: TestBed.inject(Preferences), data, table };
}

describe('Preferences 读取', () => {
  it('启动时整表读进来，get 是同步的，并按守卫收窄类型', async () => {
    const { preferences } = setup({
      rows: [
        { key: 'volume', value: 7 },
        { key: 'name', value: 'prasenjit' },
        { key: 'seed:notes', value: { version: 1 } }
      ]
    });
    await preferences.ready;
    expect(preferences.get('volume', isNumber)).toBe(7);
    expect(preferences.get('name', isString)).toBe('prasenjit');
    expect(preferences.get('seed:notes', (value): value is object => typeof value === 'object')).toEqual({
      version: 1
    });
  });

  it('没有这个键、或值的类型不符时为 undefined', async () => {
    const { preferences } = setup({ rows: [{ key: 'volume', value: 'loud' }] });
    await preferences.ready;
    expect(preferences.get('volume', isNumber)).toBeUndefined();
    expect(preferences.get('missing', isNumber)).toBeUndefined();
  });

  it('读完整表之前 get 都是 undefined', () => {
    const { preferences } = setup({ rows: [{ key: 'volume', value: 7 }] });
    expect(preferences.get('volume', isNumber)).toBeUndefined();
  });

  it('库不可用时 ready 拒绝，也不会冒出未处理的拒绝', async () => {
    const { preferences } = setup({ failLoad: new Error('db down') });
    await expect(preferences.ready).rejects.toThrow('db down');
    await expect(preferences.set('volume', 1)).rejects.toThrow('db down');
  });
});

describe('Preferences 写入', () => {
  it('新键创建一行，已有的键就地更新，get 立刻读到最新值', async () => {
    const { preferences, table } = setup();
    await preferences.set('accent', 'blue');
    expect(preferences.get('accent', isString)).toBe('blue');
    expect(table.rows).toHaveLength(1);

    await preferences.set('accent', 'red');
    expect(preferences.get('accent', isString)).toBe('red');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toMatchObject({ key: 'accent', value: 'red' });
  });

  it('覆盖启动时读进来的键', async () => {
    const { preferences, table } = setup({ rows: [{ key: 'volume', value: 1 }] });
    await preferences.set('volume', 2);
    expect(preferences.get('volume', isNumber)).toBe(2);
    expect(table.rows).toHaveLength(1);
  });

  it('同一个服务里的写入按调用顺序串行：对同一个键连着写不会建出两行', async () => {
    const { preferences, table } = setup();
    await Promise.all([preferences.set('k', 1), preferences.set('k', 2), preferences.set('k', 3)]);
    expect(table.rows).toHaveLength(1);
    expect(preferences.get('k', isNumber)).toBe(3);
  });

  it('一次写入失败只拒绝它自己，不影响后面的写入', async () => {
    const { preferences, table } = setup();
    vi.spyOn(table, 'create').mockRejectedValueOnce(new Error('disk full'));
    const failed = preferences.set('a', 1);
    const next = preferences.set('b', 2);
    await expect(failed).rejects.toThrow('disk full');
    await expect(next).resolves.toBeUndefined();
    expect(preferences.get('a', isNumber)).toBeUndefined();
    expect(preferences.get('b', isNumber)).toBe(2);
  });
});

interface Row {
  id?: string;
  key: string;
  value: unknown;
}

/** 两个标签页共用一个库：本标签页的 Preferences，加上「另一个标签页」的通知与回到前台的触发器。 */
function twoTabs(rows: readonly Row[] = []) {
  const hub = new FakeChannelHub();
  const lifecycle = new FakeLifecycle();
  const data = new FakeDesktopData();
  data.tabs = new TabSync({ channel: hub.open(), lifecycle });
  const other = new TabSync({ channel: hub.open() });
  const table = data.table<Row>(SystemPreference);
  table.seed(rows);
  const errors = { handleError: vi.fn() };
  configureServices([
    Preferences,
    { provide: DesktopData, useValue: data },
    { provide: ErrorHandler, useValue: errors }
  ]);
  const preferences = TestBed.inject(Preferences);
  const external = vi.fn();
  preferences.external$.subscribe(external);
  return { preferences, data, table, other, lifecycle, external, errors };
}

/** 让队列里的读库与写库都跑完。 */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('Preferences 多标签页（ADESK-US-105）', () => {
  it('写入在偏好锁里先读这一行的现状：别的标签页已经建了这个键，就更新它，不再建一行（键有唯一索引）', async () => {
    const locks = stubLocks();
    const { preferences, table } = twoTabs();
    await preferences.ready;
    table.seed([{ key: 'accent', value: 'red' }]);
    const create = vi.spyOn(table, 'create');

    await preferences.set('accent', 'blue');
    expect(create).not.toHaveBeenCalled();
    expect(table.rows.filter(row => row.key === 'accent')).toHaveLength(1);
    expect(table.rows.find(row => row.key === 'accent')?.value).toBe('blue');
    expect(preferences.get('accent', isString)).toBe('blue');
    expect(locks).toHaveBeenCalledWith('aiao-desktop-preferences', expect.any(Function));
  });

  it('写入成功之后通知别的标签页；写入失败不通知', async () => {
    const { preferences, data, table } = twoTabs();
    const notify = vi.spyOn(data.tabs, 'notify');
    await preferences.set('a', 1);
    expect(notify).toHaveBeenCalledExactlyOnceWith('preferences');

    vi.spyOn(table, 'create').mockRejectedValueOnce(new Error('disk full'));
    await expect(preferences.set('b', 2)).rejects.toThrow('disk full');
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('别的标签页改了偏好：收到通知后重读，get 读到新值，值变了的键从 external$ 发出', async () => {
    const { preferences, table, other, external } = twoTabs([
      { key: 'volume', value: 1 },
      { key: 'accent', value: 'blue' }
    ]);
    await preferences.ready;

    table.rows.forEach(row => {
      if (row.key === 'volume') void table.update(row, { value: 9 });
    });
    table.seed([{ key: 'wallpaper', value: 'forest' }]);
    other.notify('preferences');
    await settle();

    expect(preferences.get('volume', isNumber)).toBe(9);
    expect(preferences.get('wallpaper', isString)).toBe('forest');
    expect(external).toHaveBeenCalledTimes(1);
    expect(external.mock.calls[0][0].slice().sort()).toEqual(['volume', 'wallpaper']);
  });

  it('键被别的标签页删掉也算变化：get 变回 undefined', async () => {
    const { preferences, table, other, external } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    await table.remove(table.rows[0]);
    other.notify('preferences');
    await settle();

    expect(preferences.get('accent', isString)).toBeUndefined();
    expect(external).toHaveBeenCalledExactlyOnceWith(['accent']);
  });

  it('没有变的键不发 external$：通知过来但库里没动，什么也不发', async () => {
    const { preferences, other, external } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    other.notify('preferences');
    await settle();
    expect(external).not.toHaveBeenCalled();
  });

  it('重读时库里没有变化：不换掉缓存，读它的 computed 不会白白重算', async () => {
    const { preferences, other } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    let evaluations = 0;
    const accent = computed(() => {
      evaluations++;
      return preferences.get('accent', isString);
    });
    expect(accent()).toBe('blue');
    const before = evaluations;

    other.notify('preferences');
    await settle();
    expect(accent()).toBe('blue');
    expect(evaluations).toBe(before);
  });

  it('自己的写入不当成外部变更：写完再收到通知或回到前台，都不发 external$', async () => {
    const { preferences, other, lifecycle, external } = twoTabs();
    await preferences.set('accent', 'red');
    await preferences.set('layout', { items: [1, 2] });
    other.notify('preferences');
    lifecycle.fire('resume');
    await settle();
    expect(external).not.toHaveBeenCalled();
    expect(preferences.get('accent', isString)).toBe('red');
  });

  it('页面回到前台时重读一次：通知丢了也能追上', async () => {
    const { preferences, table, lifecycle, external } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    void table.update(table.rows[0], { value: 'red' });

    lifecycle.visibilityState = 'visible';
    lifecycle.fire('visibilitychange');
    await settle();
    expect(preferences.get('accent', isString)).toBe('red');
    expect(external).toHaveBeenCalledExactlyOnceWith(['accent']);
  });

  it('重读排在本标签页进行中的写入之后：不会拿写入之前的库内容盖掉刚写的值', async () => {
    const { preferences, table, other, external } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    let release: () => void = () => undefined;
    const update = table.update.bind(table);
    vi.spyOn(table, 'update').mockImplementationOnce(async (entity, patch) => {
      await new Promise<void>(resolve => (release = resolve));
      return update(entity, patch);
    });

    const writing = preferences.set('accent', 'red');
    await settle();
    other.notify('preferences');
    await settle();
    release();
    await writing;
    await settle();

    expect(preferences.get('accent', isString)).toBe('red');
    expect(external).not.toHaveBeenCalled();
  });

  it('重读失败交给 ErrorHandler 报告，不吞掉，也不发 external$', async () => {
    const { preferences, table, other, external, errors } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    vi.spyOn(table, 'find').mockRejectedValueOnce(new Error('db broke'));
    other.notify('preferences');
    await settle();
    expect(errors.handleError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'db broke' }));
    expect(external).not.toHaveBeenCalled();
  });

  it('库不可用时收到通知什么也不做：原因由数据问题界面说明，不在每个服务里再报一次', async () => {
    const hub = new FakeChannelHub();
    const data = new FakeDesktopData();
    data.tabs = new TabSync({ channel: hub.open() });
    const other = new TabSync({ channel: hub.open() });
    data.repository.mockRejectedValue(new Error('db down'));
    const errors = { handleError: vi.fn() };
    configureServices([
      Preferences,
      { provide: DesktopData, useValue: data },
      { provide: ErrorHandler, useValue: errors }
    ]);
    const preferences = TestBed.inject(Preferences);
    await expect(preferences.ready).rejects.toThrow('db down');
    other.notify('preferences');
    await settle();
    expect(errors.handleError).not.toHaveBeenCalled();
  });

  it('宿主销毁后不再响应通知', async () => {
    const { preferences, table, other, external } = twoTabs([{ key: 'accent', value: 'blue' }]);
    await preferences.ready;
    TestBed.resetTestingModule();
    void table.update(table.rows[0], { value: 'red' });
    other.notify('preferences');
    await settle();
    expect(external).not.toHaveBeenCalled();
  });
});
