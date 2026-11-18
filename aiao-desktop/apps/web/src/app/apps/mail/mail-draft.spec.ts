import { describe, expect, it, vi } from 'vitest';

import { MailDraftEditor, MailDraftError, MailDraftSnapshot, MailDraftWrite } from './mail-draft';

const content = { to: 'person@example.invalid', subject: 'Local draft', body: 'Keep this 🌏\nSecond line' };
const stored: MailDraftSnapshot = { ...content, id: '00000000-0000-4000-8000-000000000007' };
function setup() {
  const write = vi.fn<(change: MailDraftWrite) => Promise<void>>(async () => undefined);
  const editor = new MailDraftEditor(write, () => '00000000-0000-4000-8000-000000000001');
  editor.start();
  return { editor, write };
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

describe('MailDraftEditor', () => {
  it('新空面板没有未保存内容；填入收件人、主题或正文即变为草稿', async () => {
    const { editor, write } = setup();
    expect(editor.dirty()).toBe(false);
    expect(await editor.save()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    editor.edit(content);
    expect(editor.dirty()).toBe(true);
    expect(editor.start({ subject: 'Replace' })).toBe(false);
    expect(editor.value()).toMatchObject(content);
  });

  it('存储失败保留所有字段和稳定 ID，重试成功才推进保存基线', async () => {
    const { editor, write } = setup();
    editor.edit(content);
    const value = editor.value();
    write.mockRejectedValueOnce('INSERT desktop$mail_message failed');
    expect(await editor.save()).toBe(false);
    expect(editor.value()).toEqual(value);
    expect(editor.error()).toBe('Local storage could not complete this change. Try again.');
    expect(editor.dirty()).toBe(true);
    expect(await editor.save()).toBe(true);
    expect(write.mock.calls).toEqual([[{ base: null, value }], [{ base: null, value }]]);
    expect(editor.dirty()).toBe(false);
    editor.edit({ body: 'Edited after save' });
    await editor.save();
    expect(write.mock.calls.at(-1)?.[0].base).toEqual(value);
  });

  it('进行中的保存合并重复请求并禁止编辑、替换和丢弃', async () => {
    const { editor, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    editor.edit(content);
    const first = editor.save();
    expect(editor.save()).toBe(first);
    editor.edit({ body: 'ignored' });
    expect(editor.start()).toBe(false);
    expect(editor.open(stored)).toBe(false);
    expect(editor.discard()).toBe(false);
    expect(editor.value()).toMatchObject(content);
    await Promise.resolve();
    let settled = false;
    const pending = editor.settle().then(result => {
      settled = result;
    });
    expect(settled).toBe(false);
    wait.resolve();
    await pending;
    expect(settled).toBe(true);
    expect(await first).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('打开已有草稿只有编辑才脏；冲突保留输入，明确丢弃才清空', async () => {
    const { editor, write } = setup();
    expect(editor.open(stored)).toBe(true);
    expect(editor.dirty()).toBe(false);
    editor.edit({ subject: 'mine' });
    write.mockRejectedValueOnce(new MailDraftError('conflict'));
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('changed in another window');
    expect(editor.open({ ...stored, subject: 'remote' })).toBe(false);
    expect(editor.discard()).toBe(true);
    expect(editor.value()).toBeNull();
    expect(editor.error()).toBe('');
  });

  it('关闭等待不会自动保存未提交草稿；已删除草稿保持可恢复状态', async () => {
    const { editor, write } = setup();
    editor.open(stored);
    editor.edit({ body: 'new body' });
    expect(await editor.settle()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    write.mockRejectedValueOnce(new MailDraftError('missing'));
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('no longer available');
    expect(editor.dirty()).toBe(true);
    expect(editor.makeCopy()).toBe(true);
    expect(editor.value()?.id).not.toBe(stored.id);
    expect(editor.value()?.body).toBe('new body');
    expect(await editor.save()).toBe(true);
    expect(write.mock.calls.at(-1)?.[0].base).toBeNull();
  });

  it('预填字段也是未保存内容；容量不足反馈和副本失败保留原文', async () => {
    const { editor, write } = setup();
    expect(editor.start({ subject: 'Shared title', body: 'Shared content' })).toBe(true);
    expect(editor.dirty()).toBe(true);
    write.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    expect(await editor.save()).toBe(false);
    expect(editor.error()).toContain('storage is full');
    expect(editor.value()?.body).toBe('Shared content');
  });

  it.each([true, false])('销毁后不再接受输入或迟到结果（成功=%s）', async succeeds => {
    const { editor, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    editor.edit(content);
    const pending = editor.save();
    await Promise.resolve();
    expect(editor.makeCopy()).toBe(false);
    editor.dispose();
    if (succeeds) wait.resolve();
    else wait.reject(new Error('late'));
    expect(await pending).toBe(false);
    editor.edit(content);
    expect(editor.start()).toBe(false);
    expect(editor.open(stored)).toBe(false);
    expect(editor.makeCopy()).toBe(false);
    expect(await editor.save()).toBe(false);
    expect(await editor.settle()).toBe(false);
    expect(editor.value()).toBeNull();
  });
});
