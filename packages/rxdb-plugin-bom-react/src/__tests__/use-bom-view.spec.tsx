import { RxDB, SyncType } from '@aiao/rxdb';
import { createBomView, type BomViewHandle } from '@aiao/rxdb-plugin-bom';
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BehaviorSubject, Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBomView, type BomViewCommands, type BomViewInput, type BomViewState } from '../index.js';
import { viewCommands, viewNode, viewState } from './fixtures.js';

vi.mock('@aiao/rxdb-plugin-bom', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb-plugin-bom')>()),
  createBomView: vi.fn()
}));

const db = new RxDB({ dbName: 'react-bom-binding', entities: [], sync: { type: SyncType.None } });
const otherDb = new RxDB({ dbName: 'react-bom-binding-other', entities: [], sync: { type: SyncType.None } });
const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'X', asOfDate: new Date('2099-01-01T00:00:00Z') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};

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
  vi.mocked(createBomView).mockReset();
  handles.length = 0;
  vi.mocked(createBomView).mockImplementation(() => {
    const probe = probeHandle();
    handles.push(probe);
    return probe.handle;
  });
});

afterEach(() => cleanup());

describe('React BOM 显式绑定与生命周期', () => {
  it('真实挂载返回普通快照，四种状态、刷新和原始错误均透传', () => {
    const hook = renderHook(() => useBomView(db, input));
    expect(createBomView).toHaveBeenCalledWith(db, input);
    expect(hook.result.current.state.phase).toBe('loading');
    for (const phase of ['empty', 'success', 'error'] as const) {
      const error = phase === 'error' ? new Error('原始查询失败') : null;
      const state = viewState({ phase, error, refreshing: phase === 'success' });
      act(() => handles[0].subject.next(state));
      expect(hook.result.current.state).toBe(state);
    }
    act(() => hook.result.current.commands.refresh());
    expect(handles[0].handle.refresh).toHaveBeenCalledOnce();
  });

  it('内联重建等值完整输入时，状态更新不会再次 setInput 或重置共享视图', () => {
    const hook = renderHook(() =>
      useBomView(db, {
        ...input,
        context: { ...input.context, asOfDate: new Date(input.context.asOfDate) }
      })
    );
    const before = vi.mocked(handles[0].handle.setInput).mock.calls.length;
    act(() => handles[0].subject.next(viewState({ phase: 'success', refreshing: true })));
    expect(vi.mocked(handles[0].handle.setInput).mock.calls).toHaveLength(before);
    expect(hook.result.current.state.refreshing).toBe(true);
  });

  it('无效评估日仍交给共享控制器产生领域错误，修正日期可继续使用同一绑定', () => {
    const hook = renderHook(({ value }: { value: BomViewInput }) => useBomView(db, value), {
      initialProps: { value: input }
    });
    const invalid = { ...input, context: { ...input.context, asOfDate: new Date(NaN) } };
    expect(() => hook.rerender({ value: invalid })).not.toThrow();
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(invalid);
    hook.rerender({ value: input });
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(input);
  });

  it('公开命令原样派发当前handle的输入、折叠、编辑、保存和完整计算', async () => {
    const hook = renderHook(() => useBomView(db, input));
    await act(async () => {
      hook.result.current.commands.setInput(input);
      hook.result.current.commands.toggle(['line']);
      await hook.result.current.commands.loadOccurrence('line');
      await hook.result.current.commands.saveOccurrence({ qty: '3' });
      await expect(hook.result.current.commands.calculate()).rejects.toThrow('测试未提供完整数量结果');
    });
    expect(handles[0].handle.setInput).toHaveBeenCalledWith(input);
    expect(handles[0].handle.toggle).toHaveBeenCalledWith(['line']);
    expect(handles[0].handle.loadOccurrence).toHaveBeenCalledWith('line');
    expect(handles[0].handle.saveOccurrence).toHaveBeenCalledWith({ qty: '3' });
    expect(handles[0].handle.calculate).toHaveBeenCalledOnce();
  });

  it('输入切换调用当前 handle，普通重渲染不销毁它', () => {
    const hook = renderHook(({ value }: { value: BomViewInput }) => useBomView(db, value), {
      initialProps: { value: input }
    });
    const changed = { ...input, plannedQty: { value: '3', uom: 'pcs' } };
    hook.rerender({ value: changed });
    expect(createBomView).toHaveBeenCalledTimes(1);
    expect(handles[0].handle.setInput).toHaveBeenLastCalledWith(changed);
    expect(handles[0].handle.destroy).not.toHaveBeenCalled();
  });

  it('更换显式数据库会释放旧 handle，旧流迟到值不会覆盖新数据库', () => {
    const hook = renderHook(({ database }: { database: RxDB }) => useBomView(database, input), {
      initialProps: { database: db }
    });
    hook.rerender({ database: otherDb });
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    const fresh = viewState({ phase: 'success', nodes: [viewNode([])] });
    act(() => {
      handles[1].subject.next(fresh);
      handles[0].subject.next(viewState({ phase: 'error', error: new Error('旧库迟到错误') }));
    });
    expect(hook.result.current.state).toBe(fresh);
    expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
  });

  it('卸载释放订阅和共享 handle，重复挂载创建新的 handle，卸载后命令明确拒绝', () => {
    const first = renderHook(() => useBomView(db, input));
    const commands = first.result.current.commands;
    first.unmount();
    expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
    expect(handles[0].counts.active).toBe(0);
    expect(() => commands.refresh()).toThrow('BOM 视图尚未挂载或已经卸载');
    const second = renderHook(() => useBomView(db, input));
    expect(handles).toHaveLength(2);
    expect(handles[1].counts.active).toBe(1);
    second.unmount();
    expect(handles[1].handle.destroy).toHaveBeenCalledOnce();
  });

  it('根级 StrictMode 真正 setup-cleanup-setup，每次创建可订阅的新 handle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const Consumer = () => {
      const view = useBomView(db, input);
      return <output>{view.state.phase}</output>;
    };
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <Consumer />
          </StrictMode>
        );
      });
      expect(handles).toHaveLength(2);
      expect(handles[0].handle.destroy).toHaveBeenCalledOnce();
      expect(handles.map(probe => probe.counts.active)).toEqual([0, 1]);
      await act(async () => {
        handles[1].subject.next(viewState({ phase: 'success' }));
      });
      expect(container.textContent).toBe('success');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
    expect(handles.map(probe => probe.counts.active)).toEqual([0, 0]);
  });
});
