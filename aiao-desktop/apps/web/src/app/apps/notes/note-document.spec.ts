import { describe, expect, it, vi } from 'vitest';

import { NoteDocument, NoteSaveError, NoteSnapshot, NoteWrite, noteFailureMessage } from './note-document';

const original: NoteSnapshot = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Original',
  body: '<h1>Original</h1><p>Body</p>'
};
const changed = { title: 'Changed', body: '<h1>Changed</h1><p>Preserve 🌏</p>' };

function setup() {
  const write = vi.fn<(value: NoteWrite) => Promise<void>>(async () => undefined);
  const doc = new NoteDocument(write);
  doc.open(original);
  return { doc, write };
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

describe('NoteDocument', () => {
  it('未编辑时不写库；正文或标题变化才成为草稿', async () => {
    const { doc, write } = setup();
    expect(doc.dirty()).toBe(false);
    expect(await doc.save()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    doc.edit(changed);
    expect(doc.dirty()).toBe(true);
    doc.edit(original);
    expect(doc.dirty()).toBe(false);
  });

  it('写入失败保留正文、格式和基线，恢复后用相同内容重试', async () => {
    const { doc, write } = setup();
    doc.edit(changed);
    write.mockRejectedValueOnce(new Error('SQLITE_FULL: disk is full'));
    expect(await doc.save()).toBe(false);
    expect(doc.value()).toEqual({ ...original, ...changed });
    expect(doc.dirty()).toBe(true);
    expect(doc.error()).toContain('storage is full');
    expect(await doc.save()).toBe(true);
    expect(write.mock.calls).toEqual([
      [{ base: original, value: { ...original, ...changed } }],
      [{ base: original, value: { ...original, ...changed } }]
    ]);
    expect(doc.error()).toBe('');
    expect(doc.dirty()).toBe(false);
  });

  it('重复保存共享 Promise，成功返回前保存后续输入，逐次使用成功基线', async () => {
    const { doc, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    doc.edit(changed);
    const first = doc.save();
    expect(doc.save()).toBe(first);
    await Promise.resolve();
    doc.edit({ title: 'Newest', body: '<p>Newest</p>' });
    expect(doc.saving()).toBe(true);
    expect(doc.open({ ...original, id: '00000000-0000-4000-8000-000000000002' })).toBe(false);
    expect(doc.discard(original)).toBe(false);
    wait.resolve();
    expect(await first).toBe(true);
    expect(write.mock.calls).toEqual([
      [{ base: original, value: { ...original, ...changed } }],
      [{ base: { ...original, ...changed }, value: { ...original, title: 'Newest', body: '<p>Newest</p>' } }]
    ]);
    expect(doc.dirty()).toBe(false);
    expect(doc.saving()).toBe(false);
  });

  it('后续输入保存失败仍保留最新草稿，重试不退回旧正文', async () => {
    const { doc, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise).mockRejectedValueOnce(new Error('unavailable'));
    doc.edit(changed);
    const saving = doc.save();
    await Promise.resolve();
    doc.edit({ ...changed, body: '<p>Newest</p>' });
    wait.resolve();
    expect(await saving).toBe(false);
    expect(doc.value()?.body).toBe('<p>Newest</p>');
    expect(doc.dirty()).toBe(true);
    expect(await doc.save()).toBe(true);
    expect(write.mock.calls.at(-1)?.[0].base).toEqual({ ...original, ...changed });
  });

  it('失败草稿不会被切换覆盖，只有显式放弃才能载入最新记录', async () => {
    const { doc, write } = setup();
    doc.edit(changed);
    write.mockRejectedValueOnce(new NoteSaveError('conflict'));
    expect(await doc.save()).toBe(false);
    expect(doc.error()).toContain('changed in another window');
    const remote = { ...original, title: 'Remote', body: '<p>Remote</p>' };
    expect(doc.open(remote)).toBe(false);
    expect(doc.value()?.title).toBe('Changed');
    expect(doc.discard(remote)).toBe(true);
    expect(doc.value()).toEqual(remote);
    expect(doc.error()).toBe('');
    expect(doc.dirty()).toBe(false);
  });

  it('外部删除不会丢弃本地草稿，明确放弃后允许空文档', async () => {
    const { doc, write } = setup();
    doc.edit(changed);
    write.mockRejectedValueOnce(new NoteSaveError('missing'));
    expect(await doc.save()).toBe(false);
    expect(doc.error()).toContain('no longer available');
    expect(doc.open(null)).toBe(false);
    expect(doc.discard(null)).toBe(true);
    doc.edit(changed);
    expect(doc.value()).toBeNull();
    expect(doc.dirty()).toBe(false);
  });

  it('成功保存后可以打开另一条笔记或关闭空编辑器', async () => {
    const { doc } = setup();
    doc.edit(changed);
    await doc.save();
    expect(doc.open({ ...original, id: '00000000-0000-4000-8000-000000000002' })).toBe(true);
    expect(doc.value()?.title).toBe('Original');
    expect(doc.open(null)).toBe(true);
    expect(await doc.save()).toBe(true);
  });

  it.each([true, false])('销毁后迟到的写入不会恢复编辑器（成功=%s）', async succeeds => {
    const { doc, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    doc.edit(changed);
    const saving = doc.save();
    await Promise.resolve();
    doc.dispose();
    if (succeeds) wait.resolve();
    else wait.reject(new Error('late'));
    expect(await saving).toBe(false);
    expect(doc.value()).toBeNull();
    expect(await doc.save()).toBe(false);
    expect(doc.open(original)).toBe(false);
  });
});

describe('noteFailureMessage', () => {
  it('普通异常和非 Error 值不泄露 SQL；容量不足保留可操作反馈', () => {
    expect(noteFailureMessage('UPDATE desktop$note secret')).toBe(
      'Local storage could not complete this change. Try again.'
    );
    expect(noteFailureMessage(new DOMException('full', 'QuotaExceededError'))).toBe(
      'Browser storage is full. Free some space, then retry.'
    );
  });
});
