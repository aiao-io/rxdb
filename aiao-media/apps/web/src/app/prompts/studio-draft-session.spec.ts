import { BehaviorSubject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioDraftSnapshot, StudioPromptState } from '../../local-data/index';
import { plainPrompt } from './prompt-state';
import { StudioDraftSession } from './studio-draft-session';
function rig(initial: StudioDraftSnapshot | null = null) {
  const events = new BehaviorSubject(initial),
    watch = vi.fn<() => import('rxjs').Observable<StudioDraftSnapshot | null>>(() => events),
    read = vi.fn(async () => initial),
    save = vi.fn(async (state: StudioPromptState, revision: number | null) => {
      const row = {
        state: structuredClone(state),
        revision: (revision ?? 0) + 1
      };
      events.next(row);
      return row;
    }),
    accept = vi.fn(),
    report = vi.fn();
  return {
    events,
    watch,
    read,
    save,
    accept,
    report,
    session: new StudioDraftSession({ studioDraft: read, saveStudioDraft: save, studioDraft$: watch }, accept, report)
  };
}
const latch = () => {
  let resolve!: (row: StudioDraftSnapshot | null) => void;
  const promise = new Promise<StudioDraftSnapshot | null>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
describe('account-scoped local-first studio autosave controller', () => {
  it('restores owned template state without generating a save loop', async () => {
    const state = plainPrompt('original'),
      r = rig({ state, revision: 2 });
    await r.session.start();
    expect(r.accept).toHaveBeenCalledOnce();
    expect(r.save).not.toHaveBeenCalled();
    r.session.close();
  });
  it('debounces edits and never echoes own saved state back through the editor', async () => {
    vi.useFakeTimers();
    const r = rig();
    await r.session.start();
    r.session.edit(plainPrompt('first'));
    r.session.edit(plainPrompt('最后输入\n完整 JSON'));
    await vi.advanceTimersByTimeAsync(301);
    expect(r.save).toHaveBeenCalledOnce();
    expect(r.save.mock.calls[0][0]).toEqual(plainPrompt('最后输入\n完整 JSON'));
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('saved');
    r.session.close();
  });
  it('does not overwrite typing with a late initial read or save before loading completed', async () => {
    vi.useFakeTimers();
    const r = rig(),
      gate = latch();
    r.read.mockReturnValueOnce(gate.promise);
    const starting = r.session.start();
    r.session.edit(plainPrompt('typed during open'));
    await vi.advanceTimersByTimeAsync(500);
    expect(r.save).not.toHaveBeenCalled();
    gate.resolve({ state: plainPrompt('old'), revision: 5 });
    await starting;
    expect(r.accept).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(301);
    expect(r.save.mock.calls[0][1]).toBe(5);
    r.session.close();
  });
  it('accepts clean reactive updates but preserves dirty input and pauses on another window', async () => {
    vi.useFakeTimers();
    const r = rig();
    await r.session.start();
    r.events.next({ state: plainPrompt('remote'), revision: 1 });
    expect(r.accept).toHaveBeenLastCalledWith(plainPrompt('remote'));
    r.session.edit(plainPrompt('mine'));
    r.events.next({ state: plainPrompt('other'), revision: 2 });
    await vi.advanceTimersByTimeAsync(400);
    expect(r.save).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('conflict');
    expect(r.accept).not.toHaveBeenLastCalledWith(plainPrompt('other'));
    r.session.close();
  });
  it('reloads only on an explicit action and can CAS-replace only against a freshly read revision', async () => {
    const r = rig();
    await r.session.start();
    r.session.edit(plainPrompt('mine'));
    r.events.next({ state: plainPrompt('other'), revision: 2 });
    r.read.mockResolvedValueOnce({ state: plainPrompt('other'), revision: 2 });
    await r.session.keepCurrent();
    expect(r.save).toHaveBeenCalledWith(plainPrompt('mine'), 2);
    r.session.close();
  });
  it('does not silently retry a CAS conflict or replace the current draft', async () => {
    vi.useFakeTimers();
    const r = rig();
    await r.session.start();
    r.save.mockRejectedValueOnce({ code: 'conflict' });
    r.session.edit(plainPrompt('mine'));
    await vi.advanceTimersByTimeAsync(301);
    expect(r.report).toHaveBeenLastCalledWith('conflict');
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.save).toHaveBeenCalledOnce();
    expect(r.accept).not.toHaveBeenCalled();
    r.session.close();
  });
  it('keeps edits made during an in-flight save and then commits the latest revision', async () => {
    vi.useFakeTimers();
    const r = rig();
    await r.session.start();
    let finish!: (row: StudioDraftSnapshot) => void;
    r.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    r.session.edit(plainPrompt('one'));
    await vi.advanceTimersByTimeAsync(301);
    r.session.edit(plainPrompt('two'));
    finish({ state: plainPrompt('one'), revision: 1 });
    await vi.advanceTimersByTimeAsync(301);
    expect(r.save).toHaveBeenCalledTimes(2);
    expect(r.save.mock.calls[1]).toEqual([plainPrompt('two'), 1]);
    r.session.close();
  });
  it('fences late reads/writes and pending timers when an account is locked', async () => {
    vi.useFakeTimers();
    const r = rig(),
      gate = latch();
    r.read.mockReturnValueOnce(gate.promise);
    const loading = r.session.start();
    r.session.edit(plainPrompt('private'));
    r.session.close();
    gate.resolve({ state: plainPrompt('private old'), revision: 1 });
    await loading;
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.save).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('closed');
  });
  it('reports unreadable local data without overwriting it or claiming saved', async () => {
    const r = rig();
    r.read.mockRejectedValueOnce(new Error('corrupt'));
    await r.session.start();
    expect(r.report).toHaveBeenLastCalledWith('failed');
    r.session.edit(plainPrompt('keep'));
    await r.session.flush();
    expect(r.save).not.toHaveBeenCalled();
    r.session.close();
  });
});

describe('工作区切换前的输入检查点', () => {
  it('等待正在写入的输入，再保存等待期间的新输入', async () => {
    const r = rig();
    await r.session.start();
    let finish!: (row: StudioDraftSnapshot) => void;
    r.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    r.session.edit(plainPrompt('第一版'));
    const writing = r.session.flush();
    r.session.edit(plainPrompt('必须保留的第二版'));
    const checkpoint = r.session.checkpoint();
    finish({ state: plainPrompt('第一版'), revision: 1 });
    await writing;
    await checkpoint;
    expect(r.save).toHaveBeenCalledTimes(2);
    expect(r.save.mock.calls[1][0]).toEqual(plainPrompt('必须保留的第二版'));
    r.session.close();
  });
  it('保存失败或存在冲突时阻止切换，保留当前输入', async () => {
    const r = rig();
    await r.session.start();
    r.session.edit(plainPrompt('尚未持久化'));
    r.save.mockRejectedValue(new Error('磁盘已满'));
    await expect(r.session.checkpoint()).rejects.toThrow();
    expect(r.accept).not.toHaveBeenCalled();
    r.session.close();
  });
});

describe('explicit draft recovery and subscription failures', () => {
  it('does not report saved or resume writes when the restored subscription fails immediately', async () => {
    const r = rig({ state: plainPrompt('原草稿'), revision: 1 });
    r.watch.mockReturnValue(throwError(() => new Error('temporarily unavailable')));
    await r.session.start();
    expect(r.report).toHaveBeenLastCalledWith('failed');
    r.session.edit(plainPrompt('保留当前输入'));
    await r.session.keepCurrent();
    expect(r.report).toHaveBeenLastCalledWith('failed');
    expect(r.save).not.toHaveBeenCalled();
    r.session.close();
  });

  it('recovers a failed initial read by explicitly keeping the current input', async () => {
    const r = rig();
    r.read.mockRejectedValueOnce(new Error('temporarily unavailable'));
    await r.session.start();
    r.session.edit(plainPrompt('保留并重新保存的输入'));
    r.read.mockResolvedValueOnce({ state: plainPrompt('已存草稿'), revision: 3 });
    await r.session.keepCurrent();
    expect(r.save).toHaveBeenCalledWith(plainPrompt('保留并重新保存的输入'), 3);
    await expect(r.session.checkpoint()).resolves.toBeUndefined();
    r.events.next({ state: plainPrompt('另一标签页的新草稿'), revision: 5 });
    expect(r.accept).toHaveBeenLastCalledWith(plainPrompt('另一标签页的新草稿'));
    r.session.close();
  });

  it('recovers a failed initial read by explicitly reloading and resumes autosave', async () => {
    const r = rig();
    r.read.mockRejectedValueOnce(new Error('temporarily unavailable'));
    await r.session.start();
    r.read.mockResolvedValueOnce({ state: plainPrompt('重新载入的草稿'), revision: 3 });
    await r.session.reload();
    expect(r.accept).toHaveBeenLastCalledWith(plainPrompt('重新载入的草稿'));
    r.session.edit(plainPrompt('恢复后继续输入'));
    await expect(r.session.checkpoint()).resolves.toBeUndefined();
    expect(r.save).toHaveBeenCalledWith(plainPrompt('恢复后继续输入'), 3);
    r.events.next({ state: plainPrompt('另一标签页的新草稿'), revision: 5 });
    expect(r.accept).toHaveBeenLastCalledWith(plainPrompt('另一标签页的新草稿'));
    r.session.close();
  });

  it('preserves input typed while an explicit reload is waiting and requires a fresh keep-current decision', async () => {
    const r = rig();
    r.read.mockRejectedValueOnce(new Error('temporarily unavailable'));
    await r.session.start();
    const gate = latch();
    r.read.mockReturnValueOnce(gate.promise);
    const reloading = r.session.reload();
    r.session.edit(plainPrompt('重新载入期间的新输入'));
    gate.resolve({ state: plainPrompt('较早保存的草稿'), revision: 3 });
    await reloading;
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('conflict');
    await r.session.flush();
    expect(r.save).not.toHaveBeenCalled();
    r.read.mockResolvedValueOnce({ state: plainPrompt('最新保存的草稿'), revision: 4 });
    await r.session.keepCurrent();
    expect(r.save).toHaveBeenCalledWith(plainPrompt('重新载入期间的新输入'), 4);
    await expect(r.session.checkpoint()).resolves.toBeUndefined();
    r.session.close();
  });

  it('reloads an explicitly empty draft and clears a previously edited value', async () => {
    const r = rig({ state: plainPrompt('旧草稿'), revision: 2 });
    await r.session.start();
    r.session.edit(plainPrompt('当前输入'));
    r.read.mockResolvedValueOnce(null);
    await r.session.reload();
    expect(r.accept).toHaveBeenLastCalledWith(plainPrompt(''));
    await r.session.checkpoint();
    expect(r.save).not.toHaveBeenCalled();
    r.session.close();
  });

  it('preserves current edits if an explicit reload cannot read the saved draft', async () => {
    const r = rig();
    await r.session.start();
    r.session.edit(plainPrompt('保留当前输入'));
    r.read.mockRejectedValueOnce(new Error('unavailable'));
    await r.session.reload();
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('failed');
    r.session.close();
  });

  it('blocks automatic writes after a subscription failure and resumes only after explicit recovery', async () => {
    const r = rig();
    await r.session.start();
    r.events.error(new Error('metadata failed'));
    expect(r.report).toHaveBeenLastCalledWith('failed');
    r.session.edit(plainPrompt('仍在本页的输入'));
    await r.session.flush();
    expect(r.save).not.toHaveBeenCalled();
    await expect(r.session.checkpoint()).rejects.toThrow('尚未保存');
    r.watch.mockReturnValueOnce(new BehaviorSubject<StudioDraftSnapshot | null>(null));
    await r.session.keepCurrent();
    expect(r.save).toHaveBeenCalledWith(plainPrompt('仍在本页的输入'), null);
    r.session.close();
  });

  it('keeps a conflicting local draft when rereading the revision fails', async () => {
    const r = rig();
    await r.session.start();
    r.session.edit(plainPrompt('保留我'));
    r.events.next({ state: plainPrompt('另一端'), revision: 2 });
    r.read.mockRejectedValueOnce(new Error('unavailable'));
    await r.session.keepCurrent();
    expect(r.save).not.toHaveBeenCalled();
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.report).toHaveBeenLastCalledWith('failed');
    r.session.close();
  });

  it('discards late explicit reloads and stops edits after closing a workspace', async () => {
    const r = rig();
    await r.session.start();
    const gate = latch();
    r.read.mockReturnValueOnce(gate.promise);
    const reloading = r.session.reload();
    r.session.close();
    gate.resolve({ state: plainPrompt('已关闭的旧草稿'), revision: 3 });
    await reloading;
    r.session.edit(plainPrompt('不应保存'));
    await r.session.reload();
    await r.session.keepCurrent();
    expect(r.accept).not.toHaveBeenCalled();
    expect(r.save).not.toHaveBeenCalled();
  });

  it('does not publish a completed save after its workspace has closed', async () => {
    const r = rig();
    await r.session.start();
    let release!: (snapshot: StudioDraftSnapshot) => void;
    r.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    r.session.edit(plainPrompt('旧工作区'));
    const saving = r.session.flush();
    r.session.close();
    release({ state: plainPrompt('旧工作区'), revision: 1 });
    await saving;
    expect(r.report).toHaveBeenLastCalledWith('closed');
    expect(r.accept).not.toHaveBeenCalled();
  });
});
