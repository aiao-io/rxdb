import { describe, expect, it, vi } from 'vitest';
import {
  createEntityDetailController,
  createEntityDialogController,
  createEntityListController,
  createQueryBuilderController,
  createQueryTableController,
  type EntityInstance,
  type FormFieldConfig
} from '../headless.js';

const fields: FormFieldConfig[] = [{ field: 'title', displayName: '标题', type: 'string' }];

const record = (id: string): EntityInstance => ({
  id,
  title: id,
  save: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined)
});

describe('headless contracts', () => {
  it('列表和查询表格共享筛选、分页、排序和选择状态', () => {
    const first = record('1');
    const second = record('2');
    const list = createEntityListController({ records: [first, second], pageSize: 10 });
    const listener = vi.fn();
    list.subscribe(listener);

    list.setQuery({ title: 'a' });
    list.setSorts([{ field: 'title', sort: 'asc' }]);
    list.setPage(2, 20);
    list.setRecords([second], 61);
    list.select(['2', 'missing', '2']);
    expect(list.snapshot).toMatchObject({
      query: { title: 'a' },
      page: 2,
      pageSize: 20,
      total: 61,
      hasNext: true,
      selectedIds: ['2']
    });
    expect(listener).toHaveBeenCalled();

    const table = createQueryTableController({ records: [first, second] });
    table.setQuery({ title: 'b' });
    table.setRecords([first, second]);
    table.select(['1']);
    expect(table.snapshot.selectedIds).toEqual(['1']);
    list.dispose();
    table.dispose();
  });

  it('详情控制器转发表单、Tab、保存和关闭生命周期', async () => {
    const detail = createEntityDetailController({
      fields,
      data: { title: '初始' },
      mode: 'edit',
      tabs: [{ key: 'form', label: '基本信息', type: 'form' }]
    });
    const events: string[] = [];
    detail.subscribe((_snapshot, event) => events.push(event.type));
    detail.setField('title', '已保存');
    const saved = await detail.save(async result => {
      expect(result.changes).toEqual({ title: '已保存' });
    });
    expect(saved.valid).toBe(true);
    expect(detail.snapshot.open).toBe(false);
    expect(events).toEqual(expect.arrayContaining(['formChanged', 'saving', 'saved']));
    detail.dispose();
  });

  it('对话框支持打开、关闭、结果和资源清理', () => {
    const dialog = createEntityDialogController<string, { id: string }>({ data: { id: 'a' } });
    const listener = vi.fn();
    dialog.subscribe(listener);
    dialog.open({ id: 'b' });
    expect(dialog.snapshot).toMatchObject({ open: true, data: { id: 'b' }, result: undefined });
    dialog.resolve('done');
    expect(dialog.snapshot).toMatchObject({ open: false, result: 'done' });
    expect(listener).toHaveBeenCalledTimes(2);
    dialog.dispose();
  });

  it('查询构建器复用 QueryBuilderService 且销毁 RxJS 订阅', () => {
    const controller = createQueryBuilderController({
      fields: [{ name: 'title', displayName: '标题', type: 'string' }]
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    const id = controller.addRule(null, { field: 'title', operator: 'contains', value: 'a' });
    expect(controller.snapshot.state.rootGroup.rules).toHaveLength(1);
    controller.updateRule(id, { value: 'b' });
    expect(controller.snapshot.query).toBeDefined();
    const snapshotRule = controller.snapshot.state.rootGroup.rules[0] as { value?: unknown };
    snapshotRule.value = 'mutated outside controller';
    expect(controller.snapshot.state.rootGroup.rules[0]).toMatchObject({ value: 'b' });
    expect(listener).toHaveBeenCalled();
    controller.dispose();
  });

  it('列表查询丢弃过期结果并暴露 CRUD 能力约束', async () => {
    let resolveFirst: ((result: { records: EntityInstance[]; total: number }) => void) | undefined;
    const first = new Promise<{ records: EntityInstance[]; total: number }>(resolve => {
      resolveFirst = resolve;
    });
    const second = record('2');
    const list = createEntityListController({
      records: [record('old')],
      load: ({ query }) => (query === 'new' ? { records: [second], total: 1 } : first),
      onCreate: data => record(String(data['id'] ?? 'created')),
      onUpdate: (_record, changes) => ({ ..._record, ...changes }),
      onDelete: vi.fn()
    });
    const firstLoad = list.refresh();
    list.setQuery('new');
    await list.refresh();
    resolveFirst?.({ records: [record('stale')], total: 1 });
    await firstLoad;
    expect(list.snapshot.records.map(item => item.id)).toEqual(['2']);
    const crud = createEntityListController({
      records: [second],
      onCreate: data => record(String(data['id'] ?? 'created')),
      onUpdate: (_record, changes) => ({ ..._record, ...changes }),
      onDelete: vi.fn()
    });
    const created = await crud.create({ id: '3' });
    expect(created.id).toBe('3');
    await crud.update('3', { title: 'changed' });
    await crud.remove(['3']);
    expect(crud.snapshot.records.map(item => item.id)).toEqual(['2']);
    list.dispose();
    crud.dispose();
  });
});
