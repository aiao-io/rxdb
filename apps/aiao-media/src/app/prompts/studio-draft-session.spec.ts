import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioDraftSnapshot, StudioPromptState } from '../../local-data/index';
import { plainPrompt } from './prompt-state';
import { StudioDraftSession } from './studio-draft-session';
function rig(initial: StudioDraftSnapshot | null = null) {
  const events = new BehaviorSubject(initial),
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
    read,
    save,
    accept,
    report,
    session: new StudioDraftSession(
      { studioDraft: read, saveStudioDraft: save, studioDraft$: () => events },
      accept,
      report
    )
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
