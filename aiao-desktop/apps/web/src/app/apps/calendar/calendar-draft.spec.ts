import { describe, expect, it, vi } from 'vitest';

import { CalendarChangeError } from '../../services/calendar-records';
import type { CalendarEvent } from '../../services/calendar-store';
import { CalendarDraftEditor, CalendarDraftWrite } from './calendar-draft';

const initial = { d: [2026, 10, 17], t: '', s: 540, dur: 60, cal: 'work', loc: '', notes: '' } as const;
const existing: CalendarEvent = { ...initial, id: '00000000-0000-4000-8000-000000000007', t: 'Original' };
function setup() {
  const write = vi.fn<(change: CalendarDraftWrite) => Promise<void>>(async () => undefined);
  const remove = vi.fn<(event: CalendarEvent) => Promise<void>>(async () => undefined);
  let sequence = 0;
  const editor = new CalendarDraftEditor(
    write,
    remove,
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` as const
  );
  editor.open(initial, null);
  return { editor, write, remove };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('CalendarDraftEditor', () => {
  it('初始面板无修改，未填标题不能保存，改动保留为独立缓冲', async () => {
    const { editor, write } = setup();
    expect(editor.dirty()).toBe(false);
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('Enter an event title');
    expect(write).not.toHaveBeenCalled();
    editor.edit({ title: 'Mine', notes: 'Keep\n🌏' });
    expect(editor.dirty()).toBe(true);
    expect(editor.open(existing, existing)).toBe(false);
    expect(editor.value()?.notes).toBe('Keep\n🌏');
  });

  it('写入失败保留全部字段和稳定 ID，重试成功才标为已保存', async () => {
    const { editor, write } = setup();
    editor.edit({ title: 'Mine', date: '2026-11-18', from: '9:05 AM', to: '9:10 AM' });
    const id = editor.id();
    write.mockRejectedValueOnce('INSERT calendar_event failed');
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('Local storage could not complete');
    expect(editor.value()?.from).toBe('9:05 AM');
    expect(editor.dirty()).toBe(true);
    expect(await editor.save()).toBe(true);
    expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
    expect(write.mock.calls[0][0]).toMatchObject({ id, base: null, fields: { dur: 5, d: [2026, 10, 18] } });
    expect(editor.dirty()).toBe(false);
  });

  it('保存中重复请求共享 Promise，字段、删除、丢弃和替换不可变更', async () => {
    const { editor, write, remove } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    editor.edit({ title: 'Pending' });
    const first = editor.save();
    expect(editor.save()).toBe(first);
    editor.edit({ title: 'ignored' });
    expect(editor.discard()).toBe(false);
    expect(editor.makeCopy()).toBe(false);
    expect(editor.open(existing, existing)).toBe(false);
    expect(await editor.remove()).toBe(false);
    expect(editor.value()?.title).toBe('Pending');
    await Promise.resolve();
    let finished = false;
    const pending = editor.settle().then(result => {
      finished = result;
    });
    expect(finished).toBe(false);
    wait.resolve();
    await pending;
    expect(finished).toBe(true);
    expect(await first).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('冲突或删除不覆盖输入，可以另存为新 ID 副本', async () => {
    const { editor, write } = setup();
    editor.open(existing, existing);
    editor.edit({ title: 'Mine' });
    write.mockRejectedValueOnce(new CalendarChangeError('conflict'));
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('changed in another window');
    expect(editor.value()?.title).toBe('Mine');
    expect(editor.makeCopy()).toBe(true);
    expect(editor.id()).not.toBe(existing.id);
    expect(editor.dirty()).toBe(true);
    await editor.save();
    expect(write.mock.calls.at(-1)?.[0].base).toBeNull();
  });

  it('删除失败保留原事件和修改，恢复后才能关闭编辑器', async () => {
    const { editor, remove } = setup();
    editor.open(existing, existing);
    editor.edit({ title: 'Unstored edit' });
    remove.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    expect(await editor.remove()).toBe(false);
    expect(editor.error()).toContain('storage is full');
    expect(editor.value()?.title).toBe('Unstored edit');
    expect(await editor.remove()).toBe(true);
    expect(remove).toHaveBeenCalledWith(existing);
    expect(editor.value()).toBeNull();
    expect(editor.dirty()).toBe(false);
  });

  it('空面板无法删除或复制，显式放弃不会写库', async () => {
    const { editor, write } = setup();
    editor.edit({ title: 'Unstored' });
    expect(await editor.settle()).toBe(true);
    expect(editor.discard()).toBe(true);
    expect(await editor.save()).toBe(false);
    expect(editor.makeCopy()).toBe(false);
    expect(await editor.remove()).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([true, false])('销毁后忽略迟到结果（成功=%s）', async succeeds => {
    const { editor, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    editor.edit({ title: 'Pending' });
    const pending = editor.save();
    await Promise.resolve();
    editor.dispose();
    if (succeeds) wait.resolve();
    else wait.reject(new CalendarChangeError('missing'));
    expect(await pending).toBe(false);
    editor.edit({ title: 'ignored' });
    expect(editor.value()).toBeNull();
    expect(await editor.settle()).toBe(false);
    expect(await editor.save()).toBe(false);
    expect(editor.open(initial, null)).toBe(false);
  });
});
