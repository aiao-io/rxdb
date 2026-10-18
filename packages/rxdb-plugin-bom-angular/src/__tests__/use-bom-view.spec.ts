import { RxDB, SyncType } from '@aiao/rxdb';
import { createBomView, type BomViewHandle, type BomViewInput, type BomViewState } from '@aiao/rxdb-plugin-bom';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBomView } from '../index.js';
import { viewCommands, viewState } from './fixtures.js';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>()),
  createBomView: vi.fn()
}));

const db = new RxDB({ dbName: 'angular-bom-binding', entities: [], sync: { type: SyncType.None } });
const otherDb = new RxDB({ dbName: 'angular-bom-binding-other', entities: [], sync: { type: SyncType.None } });
const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'X', asOfDate: new Date('2099-01-01T00:00:00Z') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};

@Component({ standalone: true, template: '<output>{{ view.state().phase }}</output>' })
class Consumer {
  readonly view = useBomView(db, input);
}

@Component({ standalone: true, template: '<output>{{ view.state().phase }}</output>' })
class OtherConsumer {
  readonly view = useBomView(otherDb, input);
}

const probeHandle = () => {
  const subject = new BehaviorSubject(viewState());
  const counts = { active: 0 };
  const handle: BomViewHandle = {
    ...viewCommands(),
    state$: new Observable<BomViewState>(subscriber => {
      counts.active += 1;
      const subscription = subject.subscribe(subscriber);
      return () => {
        counts.active -= 1;
        subscription.unsubscribe();
      };
    }),
    destroy: vi.fn(() => subject.complete())
  };
  return { handle, subject, counts };
};

const handles: ReturnType<typeof probeHandle>[] = [];

beforeEach(() => {
  handles.length = 0;
  vi.mocked(createBomView).mockReset();
  vi.mocked(createBomView).mockImplementation(() => {
    const probe = probeHandle();
    handles.push(probe);
    return probe.handle;
  });
});

describe('Angular BOM 注入上下文绑定', () => {
  it('真实挂载返回 signal，加载、空、数据、错误和刷新原样透传', async () => {
    const mounted = TestBed.createComponent(Consumer);
    await mounted.whenStable();
    expect(createBomView).toHaveBeenCalledWith(db, input);
    expect(mounted.componentInstance.view.state().phase).toBe('loading');
    for (const phase of ['empty', 'success', 'error'] as const) {
      const state = viewState({
        phase,
        error: phase === 'error' ? new Error('原始查询失败') : null,
        refreshing: phase === 'success'
      });
      handles[0].subject.next(state);
      await mounted.whenStable();
      expect(mounted.componentInstance.view.state()).toBe(state);
      expect((mounted.nativeElement as HTMLElement).textContent).toBe(phase);
    }
  });

  it('共享命令原样代理完整输入、刷新、路径选择和保存', async () => {
    const mounted = TestBed.createComponent(Consumer);
    await mounted.whenStable();
    const commands = mounted.componentInstance.view.commands;
    const next = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
    commands.setInput(next);
    commands.refresh();
    commands.toggle(['branch']);
    await commands.loadOccurrence('occurrence-1');
    await commands.saveOccurrence({ qty: '3' });
    await expect(commands.calculate()).rejects.toThrow('测试未提供完整数量结果');
    expect(handles[0].handle.setInput).toHaveBeenCalledWith(next);
    expect(handles[0].handle.refresh).toHaveBeenCalledOnce();
    expect(handles[0].handle.toggle).toHaveBeenCalledWith(['branch']);
    expect(handles[0].handle.loadOccurrence).toHaveBeenCalledWith('occurrence-1');
    expect(handles[0].handle.saveOccurrence).toHaveBeenCalledWith({ qty: '3' });
  });

  it('DestroyRef 释放订阅和 handle，重新挂载建立独立订阅', async () => {
    const first = TestBed.createComponent(Consumer);
    await first.whenStable();
    expect(handles[0].counts.active).toBe(1);
    first.destroy();
    expect(handles[0].counts.active).toBe(0);
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    const second = TestBed.createComponent(Consumer);
    await second.whenStable();
    expect(handles).toHaveLength(2);
    expect(handles[1].counts.active).toBe(1);
    second.destroy();
    expect(handles[1].handle.destroy).toHaveBeenCalledOnce();
  });

  it('两个宿主分别使用显式数据库，销毁第一份不会影响第二份', async () => {
    const first = TestBed.createComponent(Consumer);
    const second = TestBed.createComponent(OtherConsumer);
    await first.whenStable();
    await second.whenStable();
    expect(createBomView).toHaveBeenNthCalledWith(1, db, input);
    expect(createBomView).toHaveBeenNthCalledWith(2, otherDb, input);
    first.destroy();
    const state = viewState({ phase: 'success' });
    handles[1].subject.next(state);
    await second.whenStable();
    expect(second.componentInstance.view.state()).toBe(state);
    expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
  });
});
