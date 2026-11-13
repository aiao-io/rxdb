import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { WeatherCity } from '../apps/weather/weather.entities';
import { configureServices } from '../testing/angular';
import { DesktopData } from './desktop-data';
import { ALL_ROWS, liveQuery } from './live-query';

/** 让已就绪的 Promise 的回调跑一轮。 */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** 手动放行的 Promise：控制「库就绪」「种子写完」的时机。 */
function gate<T>() {
  let open!: (value: T) => void;
  const promise = new Promise<T>(resolve => (open = resolve));
  return { promise, open };
}

function setup(ready: Promise<unknown> = Promise.resolve({}), seeding: Promise<void> = Promise.resolve()) {
  const ensureSeeded = vi.fn<(entity: unknown) => Promise<void>>(() => seeding);
  const handleError = vi.fn<(error: unknown) => void>();
  configureServices([
    { provide: DesktopData, useValue: { ready, ensureSeeded } },
    { provide: ErrorHandler, useValue: { handleError } }
  ]);
  const source = new Subject<number[]>();
  const query = vi.fn(() => source);
  const rows = TestBed.runInInjectionContext(() => liveQuery(query, [0], WeatherCity));
  return { rows, source, query, ensureSeeded, handleError };
}

describe('liveQuery', () => {
  it('库就绪之前保持初始值，既不种初始数据也不发起查询', async () => {
    const ready = gate<unknown>();
    const { rows, query, ensureSeeded } = setup(ready.promise);
    await tick();
    expect(rows()).toEqual([0]);
    expect(ensureSeeded).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();

    ready.open({});
    await tick();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('就绪后先保证查询读的实体所属数据域有初始数据，种完才订阅查询', async () => {
    const seeding = gate<void>();
    const { rows, query, ensureSeeded } = setup(Promise.resolve({}), seeding.promise);
    await tick();
    expect(ensureSeeded).toHaveBeenCalledExactlyOnceWith(WeatherCity);
    expect(query).not.toHaveBeenCalled();
    expect(rows()).toEqual([0]);

    seeding.open();
    await tick();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('订阅之后数据一变信号跟着刷新', async () => {
    const { rows, source } = setup();
    await tick();
    expect(rows()).toEqual([0]);
    source.next([1, 2]);
    expect(rows()).toEqual([1, 2]);
    source.next([3]);
    expect(rows()).toEqual([3]);
  });

  it('库起不来时保持初始值，不种数据、不查询，也不抛错', async () => {
    const { rows, query, ensureSeeded } = setup(Promise.reject(new Error('库不可用')));
    await tick();
    expect(rows()).toEqual([0]);
    expect(ensureSeeded).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('库就绪但初始数据写不进去：交给 ErrorHandler 报告，信号保持初始值、不抛错、不查询', async () => {
    const failure = new Error('种子装载失败');
    const { rows, query, handleError } = setup(Promise.resolve({}), Promise.reject(failure));
    await tick();
    expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(rows()).toEqual([0]);
    expect(query).not.toHaveBeenCalled();
  });

  it('宿主销毁时自动退订', async () => {
    const { source } = setup();
    await tick();
    expect(source.observed).toBe(true);
    TestBed.resetTestingModule();
    expect(source.observed).toBe(false);
  });

  it('种子还没写完宿主就销毁了：写完之后不会再去订阅查询', async () => {
    const seeding = gate<void>();
    const { query } = setup(Promise.resolve({}), seeding.promise);
    await tick();
    TestBed.resetTestingModule();
    seeding.open();
    await tick();
    expect(query).not.toHaveBeenCalled();
  });

  it('ALL_ROWS 是不带任何规则的 and 条件', () => {
    expect(ALL_ROWS).toEqual({ combinator: 'and', rules: [] });
  });
});
