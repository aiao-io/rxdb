import { describe, expect, it, vi } from 'vitest';

import { ReminderDrafts, ReminderWrite, reminderFailureMessage } from './reminder-drafts';

function setup() {
  const write = vi.fn<(draft: ReminderWrite) => Promise<void>>(async () => undefined);
  let sequence = 0;
  const drafts = new ReminderDrafts(
    write,
    () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` as const
  );
  const id = drafts.add();
  return { drafts, id, write };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('ReminderDrafts', () => {
  it('空草稿不算未保存内容；提交空白不写库', async () => {
    const { drafts, id, write } = setup();
    expect(drafts.dirty()).toBe(false);
    drafts.edit(id, '  ');
    expect(await drafts.save(id)).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(drafts.rows()).toEqual([]);
  });

  it('写失败保留标题、完成状态与错误，重试使用同一个 ID', async () => {
    const { drafts, id, write } = setup();
    drafts.edit(id, '  user text 🌏  ');
    drafts.toggle(id);
    write.mockRejectedValueOnce(new Error('Storage full'));
    expect(await drafts.save(id)).toBe(false);
    expect(drafts.rows()[0]).toMatchObject({
      id,
      title: '  user text 🌏  ',
      done: true,
      editing: true,
      createdId: null,
      error: 'Browser storage is full. Free some space, then retry.'
    });
    expect(drafts.dirty()).toBe(true);
    expect(await drafts.save(id)).toBe(true);
    expect(write.mock.calls).toEqual([
      [{ id, title: 'user text 🌏', done: true, due: 'Today' }],
      [{ id, title: 'user text 🌏', done: true, due: 'Today' }]
    ]);
    expect(drafts.rows()[0]).toMatchObject({ id, editing: false, createdId: id, error: '' });
    expect(drafts.dirty()).toBe(false);
    drafts.reconcile(new Set([id]));
    expect(drafts.rows()).toEqual([]);
  });

  it('同一个草稿的重复提交复用进行中的写入，期间不能编辑或丢弃', async () => {
    const { drafts, id, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    drafts.edit(id, 'original');
    const first = drafts.save(id);
    const duplicate = drafts.save(id);
    expect(first).toBe(duplicate);
    drafts.edit(id, 'changed');
    drafts.toggle(id);
    expect(drafts.discard(id)).toBe(false);
    expect(drafts.rows()[0]).toMatchObject({ title: 'original', done: false });
    expect(drafts.pending()).toBe(true);
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    wait.resolve();
    expect(await first).toBe(true);
    expect(drafts.pending()).toBe(false);
    expect(await drafts.save(id)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('活查询先回到记录时移除临时行，关闭仍等待写入的完成通知', async () => {
    const { drafts, id, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    drafts.edit(id, 'value');
    const pending = drafts.save(id);
    drafts.reconcile(new Set([id]));
    expect(drafts.rows()).toEqual([]);
    expect(drafts.dirty()).toBe(true);
    let closed = false;
    const closing = drafts.saveAll().then(result => {
      closed = result;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    wait.resolve();
    await pending;
    await closing;
    expect(closed).toBe(true);
    expect(drafts.dirty()).toBe(false);
  });

  it('关闭保存多个草稿；任何一个失败都会保留失败内容并取消关闭', async () => {
    const { drafts, id, write } = setup();
    const second = drafts.add();
    drafts.edit(id, 'first');
    drafts.edit(second, 'second');
    write.mockImplementation(async draft => {
      if (draft.id === id) throw new Error('Denied');
    });
    expect(await drafts.saveAll()).toBe(false);
    expect(drafts.rows().find(row => row.id === id)).toMatchObject({
      title: 'first',
      error: 'Local storage could not complete this change. Try again.'
    });
    expect(drafts.rows().find(row => row.id === second)?.createdId).toBe(second);
    write.mockResolvedValue(undefined);
    expect(await drafts.saveAll()).toBe(true);
    expect(write.mock.calls.filter(([draft]) => draft.id === second)).toHaveLength(1);
  });

  it('失败草稿只能通过明确丢弃移除，其他草稿不受影响', async () => {
    const { drafts, id, write } = setup();
    const second = drafts.add();
    drafts.edit(id, 'failed');
    drafts.edit(second, 'kept');
    write.mockRejectedValueOnce('unavailable');
    await drafts.save(id);
    expect(drafts.errorFor(id)).toBe('Local storage could not complete this change. Try again.');
    expect(drafts.discard(id)).toBe(true);
    expect(drafts.rows().map(row => row.title)).toEqual(['kept']);
    expect(drafts.errorFor('missing')).toBe('');
  });

  it('缺失草稿不生成记录，修改或删除不影响现有草稿', async () => {
    const { drafts, id, write } = setup();
    drafts.edit('missing', 'text');
    drafts.toggle('missing');
    expect(await drafts.save('missing')).toBe(true);
    expect(drafts.discard('missing')).toBe(true);
    expect(drafts.rows().map(row => row.id)).toEqual([id]);
    expect(write).not.toHaveBeenCalled();
  });

  it('setDue 只改编辑中的草稿，保存时随行写进库', async () => {
    const { drafts, id, write } = setup();
    drafts.setDue(id, 'Tomorrow');
    expect(drafts.rows()[0]).toMatchObject({ due: 'Tomorrow' });
    drafts.edit(id, 'book car');
    expect(await drafts.save(id)).toBe(true);
    expect(write.mock.calls).toEqual([[{ id, title: 'book car', done: false, due: 'Tomorrow' }]]);
  });

  it('销毁后不启动新保存，迟到失败不恢复已销毁的编辑状态', async () => {
    const { drafts, id, write } = setup();
    const wait = deferred();
    write.mockReturnValueOnce(wait.promise);
    drafts.edit(id, 'pending');
    const pending = drafts.save(id);
    await Promise.resolve();
    drafts.dispose();
    wait.reject(new Error('Late'));
    expect(await pending).toBe(false);
    expect(drafts.rows()).toEqual([]);
    expect(await drafts.saveAll()).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('reminderFailureMessage', () => {
  it('用户错误反馈不暴露 SQL 和内部表结构', () => {
    expect(reminderFailureMessage('sqlite-wasm execute() failed: INSERT INTO desktop$reminder VALUES (?)')).toBe(
      'Local storage could not complete this change. Try again.'
    );
  });
  it('存储空间不足时给出明确可操作的原因', () => {
    expect(reminderFailureMessage(new DOMException('Unavailable', 'QuotaExceededError'))).toBe(
      'Browser storage is full. Free some space, then retry.'
    );
    expect(reminderFailureMessage('SQLITE_FULL: database or disk is full')).toBe(
      'Browser storage is full. Free some space, then retry.'
    );
  });
});
