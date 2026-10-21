import { RxDB, SyncType } from '@aiao/rxdb';
import { createBomView, type BomViewHandle } from '@aiao/rxdb-plugin-bom';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBomView, type BomViewCommands, type BomViewInput, type BomViewState } from '../index.js';
import { viewCommands, viewNode, viewState } from './fixtures.js';

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

@Component({ standalone: true, template: '<output>{{ view.state().phase }}</output>' })
class SignalConsumer {
  readonly database = signal(db);
  readonly query = signal(input);
  readonly view = useBomView(this.database, this.query);
}

const probeHandle = () => {
  const subject = new BehaviorSubject(viewState());
  let destroyed = false;
  const counts = { active: 0 };
  const commands: BomViewCommands = viewCommands();
  const handle: BomViewHandle = {
    ...commands,
    state$: new Observable<BomViewState>(subscriber => {
      if (destroyed) throw new Error('已销毁的 handle 不能重订阅');
      counts.active += 1;
      const subscription = subject.subscribe(subscriber);
      return () => {
        counts.active -= 1;
        subscription.unsubscribe();
      };
    }),
    destroy: vi.fn(() => {
      destroyed = true;
      subject.complete();
    })
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

  it('内联重建等值完整输入时，不会再次 setInput 或重置共享视图', async () => {
    const mounted = TestBed.createComponent(SignalConsumer);
    await mounted.whenStable();
    mounted.componentInstance.query.set({
      ...input,
      context: { ...input.context, asOfDate: new Date(input.context.asOfDate) }
    });
    handles[0].subject.next(viewState({ phase: 'success', refreshing: true }));
    await mounted.whenStable();
    expect(createBomView).toHaveBeenCalledTimes(1);
    expect(handles[0].handle.setInput).not.toHaveBeenCalled();
    expect(mounted.componentInstance.view.state().refreshing).toBe(true);
  });

  it('无效评估日仍交给共享控制器产生领域错误，修正日期可继续使用同一绑定', async () => {
    const mounted = TestBed.createComponent(SignalConsumer);
    await mounted.whenStable();
    const invalid = { ...input, context: { ...input.context, asOfDate: new Date(NaN) } };
    mounted.componentInstance.query.set(invalid);
    await mounted.whenStable();
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(invalid);
    mounted.componentInstance.query.set(input);
    await mounted.whenStable();
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(input);
    expect(createBomView).toHaveBeenCalledTimes(1);
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

  it('普通值输入只在创建时读取一次：原地修改后再跑变更检测不会 setInput，切换须传 Signal', async () => {
    const query = structuredClone(input);
    @Component({ standalone: true, template: '<output>{{ view.state().phase }}</output>' })
    class PlainConsumer {
      readonly view = useBomView(db, query);
    }
    const mounted = TestBed.createComponent(PlainConsumer);
    await mounted.whenStable();
    query.plannedQty.value = '3';
    handles[0].subject.next(viewState({ phase: 'success' }));
    await mounted.whenStable();
    expect((mounted.nativeElement as HTMLElement).textContent).toBe('success');
    expect(createBomView).toHaveBeenCalledTimes(1);
    expect(handles[0].handle.setInput).not.toHaveBeenCalled();
  });

  it('输入切换调用当前 handle，变更检测不销毁它', async () => {
    const mounted = TestBed.createComponent(SignalConsumer);
    await mounted.whenStable();
    const changed = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
    mounted.componentInstance.query.set(changed);
    await mounted.whenStable();
    expect(createBomView).toHaveBeenCalledTimes(1);
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(changed);
    expect(handles[0].handle.destroy).not.toHaveBeenCalled();
  });

  it('更换显式数据库会释放旧 handle，旧流迟到值不会覆盖新数据库', async () => {
    const mounted = TestBed.createComponent(SignalConsumer);
    await mounted.whenStable();
    const changed = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
    mounted.componentInstance.database.set(otherDb);
    mounted.componentInstance.query.set(changed);
    await mounted.whenStable();
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    expect(createBomView).toHaveBeenLastCalledWith(otherDb, changed);
    expect(handles[1].handle.setInput).not.toHaveBeenCalled();
    const fresh = viewState({ phase: 'success', nodes: [viewNode([])] });
    handles[1].subject.next(fresh);
    handles[0].subject.next(viewState({ phase: 'error', error: new Error('旧库迟到错误') }));
    await mounted.whenStable();
    expect(mounted.componentInstance.view.state()).toBe(fresh);
    expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
  });

  it('DestroyRef 释放订阅和 handle，重新挂载建立独立订阅，销毁后命令明确拒绝', async () => {
    const first = TestBed.createComponent(Consumer);
    await first.whenStable();
    expect(handles[0].counts.active).toBe(1);
    const commands = first.componentInstance.view.commands;
    first.destroy();
    expect(handles[0].counts.active).toBe(0);
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    expect(() => commands.refresh()).toThrow('BOM 视图尚未挂载或已经卸载');
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
