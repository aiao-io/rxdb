import { describe, expect, it, vi } from 'vitest';
import { createEntityDetailController } from '../entity-detail/headless.js';
import { createEntityDialogController } from '../entity-dialog/headless.js';
import { createEntityListController } from '../entity-list/headless.js';
import type { EntityInstance } from '../entity-list/types.js';
import { createQueryTableController } from '../entity-table/headless.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

class Item implements EntityInstance {
  [key: string]: unknown;
  title = '';
  other = '';
  constructor(readonly id: string) {}
  async save(): Promise<void> {
    return;
  }
  async remove(): Promise<void> {
    return;
  }
}

const detail = () =>
  createEntityDetailController({
    fields: [{ field: 'title', displayName: '标题', type: 'string' }],
    data: { title: '原值' },
    mode: 'edit'
  });

describe('列表异步生命周期回归', () => {
  it('同一查询刷新失败保留记录、总数和选择，切换查询后立即清空旧结果', async () => {
    const failure = new Error('offline');
    const list = createEntityListController({
      load: () => {
        throw failure;
      }
    });
    const old = new Item('old');
    list.setRecords([old], 9);
    list.select(['old']);
    await expect(list.refresh()).rejects.toBe(failure);
    expect(list.snapshot).toMatchObject({
      records: [old],
      total: 9,
      selectedIds: ['old'],
      loading: false,
      error: failure
    });
    list.setQuery('new');
    expect(list.snapshot).toMatchObject({ records: [], total: undefined, selectedIds: [], error: null });
    list.setRecords([old], 9);
    list.setSorts([{ field: 'title', sort: 'asc' }]);
    expect(list.snapshot.records).toEqual([]);
    list.setRecords([old], 9);
    list.setPage(1);
    expect(list.snapshot).toMatchObject({ records: [], total: undefined, selectedIds: [] });
  });

  it('外部数据更新后忽略旧刷新并中止旧查询', async () => {
    const pending = deferred<{ records: Item[] }>();
    let signal: AbortSignal | undefined;
    const list = createQueryTableController({
      load: context => {
        signal = context.signal;
        return pending.promise;
      }
    });
    const refresh = list.refresh();
    const current = new Item('current');
    list.setRecords([current], 1);
    expect(signal?.aborted).toBe(true);
    pending.resolve({ records: [new Item('stale')] });
    await refresh;
    expect(list.snapshot).toMatchObject({ records: [current], loading: false, total: 1 });
  });

  it('void 更新保留实体原型和实例，重叠更新按同一 id 串行', async () => {
    const first = deferred<void>();
    const item = new Item('1');
    const callback = vi.fn(async (record: Item, changes: Record<string, unknown>) => {
      if (changes['title']) await first.promise;
      Object.assign(record, changes);
    });
    const list = createEntityListController({ records: [item], onUpdate: callback });
    const one = list.update('1', { title: '新值' });
    const two = list.update('1', { other: '另一值' });
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    first.resolve();
    expect(await one).toBe(item);
    expect(await two).toBe(item);
    expect(list.snapshot.records[0]).toBe(item);
    expect(item).toMatchObject({ title: '新值', other: '另一值' });
    expect(item.save).toBeTypeOf('function');
  });

  it('首个更新后的自动刷新不跳过同一实体的第二个排队写入', async () => {
    const first = deferred<void>();
    const item = new Item('1');
    const callback = vi.fn(async (record: Item, changes: Record<string, unknown>) => {
      if (changes['title']) await first.promise;
      Object.assign(record, changes);
    });
    const load = vi.fn(() => ({ records: [item], total: 1 }));
    const list = createEntityListController({ records: [item], onUpdate: callback, load });
    const one = list.update('1', { title: 'first' });
    const two = list.update('1', { other: 'second' });
    first.resolve();
    await Promise.all([one, two]);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(list.snapshot.records[0]).toMatchObject({ title: 'first', other: 'second' });
  });

  it('写入期间启动的刷新会在写入完成后失效', async () => {
    const write = deferred<Item>();
    const loaded = deferred<{ records: Item[] }>();
    const item = new Item('1');
    const updated = new Item('1');
    updated.title = 'saved';
    const list = createEntityListController({ records: [item], onUpdate: () => write.promise });
    const update = list.update('1', { title: 'saved' });
    const refresh = list.refresh(() => loaded.promise);
    write.resolve(updated);
    await update;
    loaded.resolve({ records: [item] });
    await refresh;
    expect(list.snapshot.records[0]).toBe(updated);
    expect(list.snapshot.loading).toBe(false);
  });

  it('部分删除失败仍移除成功记录和选择，并同步总数', async () => {
    const failure = new Error('禁止删除');
    const list = createEntityListController({
      onDelete: record => {
        if (record.id === '2') throw failure;
      }
    });
    list.setRecords([new Item('1'), new Item('2')], 5);
    list.select(['1', '2']);
    await expect(list.remove(['1', '2'])).rejects.toBeInstanceOf(AggregateError);
    expect(list.snapshot).toMatchObject({
      records: [expect.objectContaining({ id: '2' })],
      total: 4,
      selectedIds: ['2']
    });
  });

  it.each(['query', 'dispose'] as const)('批删期间 %s 后仍向调用方报告写入失败', async action => {
    const pending = deferred<void>();
    const failure = new Error('delete failed');
    const list = createEntityListController({ records: [new Item('1')], onDelete: () => pending.promise });
    const remove = list.remove(['1']);
    const rejection = expect(remove).rejects.toMatchObject({ errors: [failure] });
    if (action === 'query') list.setQuery('next');
    else list.dispose();
    pending.reject(failure);
    await rejection;
  });

  it('CRUD 期间旧刷新失效，成功后按 loader 重算筛选、排序和分页', async () => {
    const oldRefresh = deferred<{ records: Item[]; total: number }>();
    const created = new Item('created');
    const visible = new Item('visible');
    const load = vi
      .fn()
      .mockReturnValueOnce(oldRefresh.promise)
      .mockResolvedValue({ records: [visible], total: 7 });
    const list = createEntityListController({ query: 'filtered', pageSize: 1, load, onCreate: () => created });
    const before = list.refresh();
    expect(await list.create({ title: 'outside filter' })).toBe(created);
    oldRefresh.resolve({ records: [new Item('stale')], total: 2 });
    await before;
    expect(load).toHaveBeenCalledTimes(2);
    expect(list.snapshot).toMatchObject({ records: [visible], total: 7 });
  });

  it('切换视图或销毁后不发布旧 mutation 完成状态', async () => {
    const pending = deferred<Item>();
    const list = createEntityListController({ onCreate: () => pending.promise });
    const create = list.create({});
    list.setQuery('next');
    const next = new Item('next');
    list.setRecords([next]);
    pending.resolve(new Item('old'));
    await create;
    expect(list.snapshot.records).toEqual([next]);

    const second = deferred<Item>();
    const disposed = createEntityListController({ onCreate: () => second.promise });
    const mutation = disposed.create({});
    disposed.dispose();
    const snapshot = disposed.snapshot;
    second.resolve(new Item('late'));
    await mutation;
    expect(disposed.snapshot).toBe(snapshot);
    expect(() => disposed.select([])).toThrow(/disposed/);
  });

  it('更新等待期间切换查询后不再调用排队的更新回调', async () => {
    const pending = deferred<void>();
    const callback = vi.fn(async (record: Item, changes: Record<string, unknown>) => {
      if (changes['title']) await pending.promise;
      Object.assign(record, changes);
    });
    const item = new Item('1');
    const list = createEntityListController({ records: [item], onUpdate: callback });
    const first = list.update('1', { title: 'first' });
    const second = list.update('1', { other: 'second' });
    list.setQuery('next');
    pending.resolve();
    await expect(first).resolves.toBe(item);
    await expect(second).resolves.toBe(item);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(list.snapshot.records).toEqual([]);
  });

  it('清空受约束视图后等待宿主补数据，能力拒绝不执行 mutation', async () => {
    const create = vi.fn(() => new Item('created'));
    const list = createEntityListController({ query: 'filtered', records: [new Item('old')], onCreate: create });
    await list.create({});
    expect(list.snapshot.records).toEqual([]);
    list.setCapabilities({ canCreate: false, canEdit: false, canDelete: false });
    await expect(list.create({})).rejects.toThrow(/not allowed/);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('详情和弹窗异步生命周期回归', () => {
  it('阻止重入保存，保留保存期间的后续编辑', async () => {
    const controller = detail();
    const pending = deferred<void>();
    const save = vi.fn(() => pending.promise);
    controller.setField('title', '提交值');
    const first = controller.save(save);
    await expect(controller.save(save)).rejects.toThrow(/progress/);
    controller.setField('title', '后续编辑');
    pending.resolve();
    expect((await first).valid).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.snapshot).toMatchObject({ open: true, saving: false, form: { data: { title: '后续编辑' } } });
  });

  it('onSave 内部重入保存也被拒绝', async () => {
    const controller = detail();
    let nested: Promise<unknown> | undefined;
    const outer = controller.save(() => {
      nested = controller.save();
    });
    await expect(outer).resolves.toMatchObject({ valid: true });
    await expect(nested).rejects.toThrow(/progress/);
  });

  it('取消或关闭并重开后不接收旧保存结果', async () => {
    const controller = detail();
    const pending = deferred<void>();
    controller.setField('title', '提交值');
    const save = controller.save(() => pending.promise);
    controller.cancel();
    controller.close();
    controller.open();
    pending.resolve();
    await save;
    expect(controller.snapshot).toMatchObject({ open: true, saving: false, form: { data: { title: '原值' } } });
  });

  it('持久化成功后销毁不应变成失败，销毁后的展示动作抛错', async () => {
    const controller = detail();
    const pending = deferred<void>();
    const save = controller.save(() => pending.promise);
    controller.dispose();
    const snapshot = controller.snapshot;
    pending.resolve();
    await expect(save).resolves.toMatchObject({ valid: true });
    expect(controller.snapshot).toBe(snapshot);
    expect(() => controller.open()).toThrow(/disposed/);
    expect(() => controller.close()).toThrow(/disposed/);
  });

  it('保存失败保留草稿，关闭弹窗的数据更新只发 dataChanged，允许显式清空', async () => {
    const controller = detail();
    const failure = new Error('写入失败');
    controller.setField('title', '草稿');
    await expect(
      controller.save(() => {
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(controller.snapshot).toMatchObject({
      open: true,
      saving: false,
      error: failure,
      form: { data: { title: '草稿' } }
    });
    const dialog = createEntityDialogController<string, string>({ data: 'old' });
    const events: string[] = [];
    dialog.subscribe((_snapshot, event) => events.push(event.type));
    dialog.setData(undefined);
    expect(dialog.snapshot).toMatchObject({ open: false, data: undefined });
    expect(events).toEqual(['dataChanged']);
    dialog.dispose();
    expect(() => dialog.open()).toThrow(/disposed/);
    expect(() => dialog.setData('late')).toThrow(/disposed/);
    expect(() => dialog.resolve('late')).toThrow(/disposed/);
  });
});
