import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { DesktopData } from './desktop-data';
import { ALL_ROWS, liveQuery } from './live-query';

/** 让已就绪的 Promise 的回调跑一轮。 */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function setup(ready: Promise<unknown> = Promise.resolve({})) {
  configureServices([{ provide: DesktopData, useValue: { ready } }]);
  const source = new Subject<number[]>();
  const query = vi.fn(() => source);
  const rows = TestBed.runInInjectionContext(() => liveQuery(query, [0]));
  return { rows, source, query };
}

describe('liveQuery', () => {
  it('库就绪之前保持初始值，也不发起查询', async () => {
    let open: (value: unknown) => void = () => undefined;
    const { rows, query } = setup(new Promise(resolve => (open = resolve)));
    await tick();
    expect(rows()).toEqual([0]);
    expect(query).not.toHaveBeenCalled();

    open({});
    await tick();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('就绪后订阅查询，数据一变信号跟着刷新', async () => {
    const { rows, source } = setup();
    await tick();
    expect(rows()).toEqual([0]);
    source.next([1, 2]);
    expect(rows()).toEqual([1, 2]);
    source.next([3]);
    expect(rows()).toEqual([3]);
  });

  it('库起不来时保持初始值，不查询也不抛错', async () => {
    const { rows, query } = setup(Promise.reject(new Error('库不可用')));
    await tick();
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

  it('ALL_ROWS 是不带任何规则的 and 条件', () => {
    expect(ALL_ROWS).toEqual({ combinator: 'and', rules: [] });
  });
});
