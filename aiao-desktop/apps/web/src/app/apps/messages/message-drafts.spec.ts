import { describe, expect, it, vi } from 'vitest';

import { LocalMessage, MessageDrafts, MessageSaveError } from './message-drafts';

function setup() {
  const write = vi.fn<(message: LocalMessage) => Promise<void>>(async () => undefined);
  let index = 0;
  const drafts = new MessageDrafts(
    write,
    () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}` as const
  );
  return { drafts, write };
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

describe('MessageDrafts', () => {
  it('各会话保留独立草稿，保存一个不会清空另一个', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', '  first 🌏  ');
    drafts.edit('B', 'second');
    expect(drafts.get('A')?.text).toBe('  first 🌏  ');
    expect(drafts.get('B')?.text).toBe('second');
    expect(await drafts.save('A')).toBe(true);
    expect(drafts.get('A')).toBeUndefined();
    expect(drafts.get('B')?.text).toBe('second');
    expect(drafts.dirty()).toBe(true);
    expect(write.mock.calls[0][0]).toMatchObject({ threadId: 'A', text: 'first 🌏' });
  });

  it('失败保留原文与稳定 ID，不显示 SQL，重试成功才清空', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', 'original');
    const id = drafts.get('A')?.id;
    write.mockRejectedValueOnce('INSERT INTO desktop$chat_message failed');
    expect(await drafts.save('A')).toBe(false);
    expect(drafts.get('A')).toMatchObject({
      id,
      text: 'original',
      saving: false,
      error: 'Local storage could not complete this change. Try again.'
    });
    expect(await drafts.save('A')).toBe(true);
    expect(write.mock.calls).toEqual([
      [{ id, threadId: 'A', text: 'original' }],
      [{ id, threadId: 'A', text: 'original' }]
    ]);
    expect(drafts.dirty()).toBe(false);
  });

  it('重复保存共享在途 Promise，输入与丢弃在完成前不能改动它', async () => {
    const { drafts, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    drafts.edit('A', 'original');
    const first = drafts.save('A');
    expect(drafts.save('A')).toBe(first);
    drafts.edit('A', 'changed');
    expect(drafts.discard('A')).toBe(false);
    expect(drafts.get('A')?.text).toBe('original');
    expect(drafts.pending()).toBe(true);
    await Promise.resolve();
    let settled = false;
    const close = drafts.settle().then(result => {
      settled = result;
    });
    expect(settled).toBe(false);
    wait.resolve();
    await close;
    expect(settled).toBe(true);
    expect(await first).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(drafts.pending()).toBe(false);
  });

  it('关闭等待只等待已提交的写入，不自动提交其他草稿', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', 'unsent');
    expect(await drafts.settle()).toBe(true);
    expect(drafts.dirty()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(drafts.discard('A')).toBe(true);
    expect(drafts.dirty()).toBe(false);
  });

  it('一个会话保存失败不会阻断其他会话写入，关闭等待返回失败', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', 'failed');
    drafts.edit('B', 'saved');
    write.mockImplementation(async message => {
      if (message.threadId === 'A') throw new MessageSaveError('missing');
    });
    const first = drafts.save('A');
    const second = drafts.save('B');
    expect(await drafts.settle()).toBe(false);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(drafts.get('A')?.error).toContain('conversation is no longer available');
    expect(drafts.get('B')).toBeUndefined();
  });

  it('空白文本不会创建消息，明确丢弃只作用于对应会话', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', '  ');
    expect(drafts.dirty()).toBe(false);
    expect(await drafts.save('A')).toBe(true);
    expect(await drafts.save('missing')).toBe(true);
    drafts.edit('B', 'kept');
    expect(drafts.discard('missing')).toBe(true);
    expect(drafts.get('B')?.text).toBe('kept');
    expect(write).not.toHaveBeenCalled();
  });

  it('失败后可以修改内容但保留相同 ID，容量错误与冲突提供操作提示', async () => {
    const { drafts, write } = setup();
    drafts.edit('A', 'first');
    const id = drafts.get('A')?.id;
    write.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    await drafts.save('A');
    expect(drafts.get('A')?.error).toContain('storage is full');
    drafts.edit('A', 'changed');
    expect(drafts.get('A')).toMatchObject({ id, text: 'changed', error: '' });
    write.mockRejectedValueOnce(new MessageSaveError('conflict'));
    expect(await drafts.save('A')).toBe(false);
    expect(drafts.get('A')?.error).toContain('different content');
  });

  it.each([true, false])('销毁后不启动新写入或恢复迟到的草稿（成功=%s）', async succeeds => {
    const { drafts, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    drafts.edit('A', 'pending');
    const saving = drafts.save('A');
    await Promise.resolve();
    drafts.dispose();
    if (succeeds) wait.resolve();
    else wait.reject(new Error('late'));
    expect(await saving).toBe(false);
    drafts.edit('B', 'ignored');
    expect(drafts.rows()).toEqual([]);
    expect(await drafts.save('A')).toBe(false);
    expect(await drafts.settle()).toBe(false);
  });
});
