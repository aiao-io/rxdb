import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { DesktopData } from './desktop-data';
import { Preferences } from './preferences';
import { SystemPreference } from './system-preference.entity';

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
