/**
 * EntityList —— **真实组件源码**（Angular `entity-list.real.spec.ts` 的 React 移植）。
 *
 * 覆盖 namespace/name → useInfiniteScroll 无限滚动加载、行内编辑批量合并
 * （真实 VTable 事件 → onCellChanged → enqueue → entityManager.mutations）、
 * 撤销/重做（真实 @aiao/rxdb-plugin-history）、筛选弹层（QueryBuilder）、
 * 选择模式 onSelectionConfirmed 输出与行删除。数据源为 `@aiao/rxdb-test/entities`
 * 的 Todo 实体 + 内存本地适配器，查询语义全部来自 @aiao/rxdb 核心。
 *
 * React 测试经 DOM（按钮点击 / 键盘 / FakeListTable 事件）驱动，
 * 对应 Angular 侧直接调用组件方法的覆盖点。
 */
import { Entity, EntityBase, PropertyType, RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import { isRowDragEnabled } from '@aiao/rxdb-model';
import { RxDBProvider } from '@aiao/rxdb-react';
import { Account, AuditLog, Contract, Invoice, Task, Todo } from '@aiao/rxdb-test/entities';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityList, type EntityListProps } from '../../entity-list/entity-list';
import { FakeListTable, getLastListTable } from '../testing/fake-vtable';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// VTable 引擎打桩（列表经 query-table → entity-table 渲染真实组件链，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** 整表手动排序、但 `update: 'system'` 的实体（US-028 AC#7：EntityList 整表挂 `_readonly`） */
@Entity({
  name: 'LockedTask',
  namespace: 'test',
  manualOrder: true,
  permissions: { update: 'system' },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class LockedTask extends EntityBase {
  declare title: string;
}

describe('EntityList（真实组件）', () => {
  let rxdb: RxDB;
  let adapter: InMemoryRxDBAdapter;

  beforeAll(async () => {
    rxdb = createInMemoryRxdb([
      Todo,
      Account,
      AuditLog,
      Invoice,
      Contract,
      Task,
      LockedTask
    ] as unknown as EntityType[]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    const { firstValueFrom } = await import('rxjs');
    adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
  });

  beforeEach(() => {
    adapter.resetData();
  });

  /** 落库一条 Todo 并返回实例。 */
  async function seedTodo(title: string, completed = false): Promise<Todo> {
    const todo = new Todo({ title, completed });
    await todo.save();
    return todo;
  }

  /** 挂载列表组件并等待首页加载完成。 */
  async function renderList(props: Partial<EntityListProps> = {}) {
    const confirmed: Array<Array<{ id: string }>> = [];
    const cancelled: unknown[] = [];
    const viewed: unknown[] = [];
    const utils = render(
      <RxDBProvider db={rxdb}>
        <EntityList
          namespace={props.namespace ?? 'public'}
          name={props.name ?? 'Todo'}
          mode={props.mode}
          fixedQuery={props.fixedQuery}
          initialFilter={props.initialFilter}
          fixedFormData={props.fixedFormData}
          draftParentEntity={props.draftParentEntity}
          parentRelationName={props.parentRelationName}
          creationChain={props.creationChain}
          editChain={props.editChain}
          relationKind={props.relationKind}
          parentEntity={props.parentEntity}
          alreadyLinkedIds={props.alreadyLinkedIds}
          onViewEntity={record => viewed.push(record)}
          onSelectionConfirmed={entities => confirmed.push(entities)}
          onSelectionCancelled={() => cancelled.push(null)}
        />
      </RxDBProvider>
    );
    await waitFor(() => {
      expect(getLastListTable()).toBeInstanceOf(FakeListTable);
    });
    await FLUSH();
    return { ...utils, confirmed, cancelled, viewed };
  }

  /** 列表渲染树里的真实表格引擎实例。 */
  function tableOf(): FakeListTable {
    return getLastListTable();
  }

  const repoOf = () => rxdb.entityManager.getRepository(Todo as unknown as EntityType);

  /** 查询实体当前落库的 title 列表（升序）。 */
  const titlesOf = async (entityType: EntityType): Promise<string[]> => {
    const seen: string[][] = [];
    const subscription = rxdb.entityManager
      .getRepository(entityType)
      .find({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'title', sort: 'asc' }] } as never)
      .subscribe(rows => seen.push(rows.map(r => (r as unknown as { title: string }).title)));
    await FLUSH();
    await FLUSH();
    subscription.unsubscribe();
    return seen.at(-1) ?? [];
  };
  const findTitles = (): Promise<string[]> => titlesOf(Todo as unknown as EntityType);

  it('namespace/name 输入驱动无限滚动列表加载真实数据', async () => {
    await seedTodo('alpha');
    await seedTodo('beta');

    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });

    expect(container.textContent).toContain('Todo');
    const titles = tableOf()
      .records.map(r => r['title'])
      .sort();
    expect(titles).toEqual(['alpha', 'beta']);
  });

  it('行内编辑经真实事件链（VTable → onCellChanged → mutations）批量合并落库', async () => {
    const a = await seedTodo('before-edit');
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    // 真实事件链：表格引擎事件 → EntityTable → QueryTable → EntityList
    const table = tableOf();
    const row = table.records.findIndex(r => r['id'] === a.id) + 1;

    // 同一行两个字段的连续编辑：进入同一个合并批次
    act(() => {
      table.emit('change_cell_value', { col: 2, row, changedValue: 'merged-title' });
      table.emit('checkbox_state_change', { col: 3, row, checked: true });
    });
    await waitFor(async () => {
      expect(await findTitles()).toEqual(['merged-title']);
    });

    const rows = await new Promise<unknown[]>(resolve => {
      repoOf()
        .find({ where: { combinator: 'and', rules: [] } } as never)
        .subscribe(resolve);
    });
    expect((rows[0] as Record<string, unknown>)['completed']).toBe(true);
    // 批量合并：同一行的两个字段合成一条 UPDATE 变更
    const updates = adapter.changes.filter(c => c.type === 'UPDATE');
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ title: 'merged-title', completed: true });
    // 活查询已把新值推到表格记录
    await waitFor(() => {
      expect(tableOf().records[0]['title']).toBe('merged-title');
    });
    void container;
  });

  it('undo / redo 恢复与重放行内编辑（真实历史插件）', async () => {
    await seedTodo('undo-me');
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('change_cell_value', { col: 2, row: 1, changedValue: 'changed' });
    });

    const undoBtn = () => container.querySelector('[aria-label="撤销 (Ctrl+Z)"]') as HTMLButtonElement;
    await waitFor(() => {
      expect(undoBtn().textContent?.trim()).not.toBe('');
      expect(undoBtn().disabled).toBe(false);
    });

    fireEvent.click(undoBtn());
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toContain('undo-me');
    });

    const redoBtn = () => container.querySelector('[aria-label="重做 (Ctrl+Shift+Z)"]') as HTMLButtonElement;
    expect(redoBtn().disabled).toBe(false);
    fireEvent.click(redoBtn());
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toContain('changed');
    });
  });

  /**
   * 弹层内被 aria-hidden 祖先遮蔽的可聚焦控件（正常必须为空）。
   *
   * @remarks aria-hidden 会把整棵子树从无障碍树里摘掉：屏幕阅读器读不到、
   * axe 的 aria-hidden-focus 判违规、基于 role 的定位（含 e2e getByRole）也全部落空。
   */
  const hiddenFocusablesIn = (root: ParentNode): string[] =>
    [...root.querySelectorAll('button, input, select, textarea, [tabindex]')]
      .filter(el => el.closest('[aria-hidden="true"]') !== null)
      .map(el => el.outerHTML.slice(0, 80));

  /** 在筛选弹层里把首条规则的字段切成 title 并把操作符设为「包含」（Todo 首字段是布尔 completed）。 */
  function configureContainsRule(container: HTMLElement): void {
    fireEvent.click(container.querySelector('[aria-label="添加第一个条件"]') as HTMLElement);
    // happy-dom 无 Popover API：全部弹层打桩 hidePopover
    for (const p of container.querySelectorAll('[popover]')) {
      (p as HTMLElement).hidePopover = vi.fn();
    }
    // 字段选择器树：选 title 叶子（触发按钮带 popovertarget）
    const rule = container.querySelector('.rxdb-query-rule') as HTMLElement;
    fireEvent.click(rule.querySelector('button[popovertarget]') as HTMLElement);
    const treePopover = container.querySelectorAll('[popover]')[0] as HTMLElement;
    fireEvent.click(
      [...treePopover.querySelectorAll('[role="treeitem"]')].find(i =>
        i.textContent?.trim().startsWith('title')
      ) as HTMLElement
    );
    // 操作符选择器：选「包含」
    const opPopover = container.querySelectorAll('[popover]')[1] as HTMLElement;
    fireEvent.click(
      [...opPopover.querySelectorAll('li[role="none"] button[role="option"]')].find(
        b => b.textContent?.trim() === '包含'
      ) as HTMLElement
    );
  }

  it('筛选弹层：query-builder 条件应用后列表按 where 重查', async () => {
    await seedTodo('match-alpha');
    await seedTodo('match-beta');
    await seedTodo('other');

    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(3);
    });

    // 打开弹层 → 渲染真实 QueryBuilder
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('筛选'))!);
    expect(container.textContent).toContain('确定');

    // 用户输入条件 → 应用 → 列表按真实 where 过滤
    configureContainsRule(container);
    fireEvent.change(container.querySelector('input[placeholder="输入值"]') as HTMLInputElement, {
      target: { value: 'match' }
    });
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.trim() === '确定')!);

    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });
    expect(container.textContent).toContain('2 条记录');
    expect(
      tableOf()
        .records.map(r => r['title'])
        .sort()
    ).toEqual(['match-alpha', 'match-beta']);

    // 重置筛选恢复全量
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('筛选'))!);
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.trim() === '重置')!);
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(3);
    });
  });

  it('筛选弹层的可聚焦控件必须留在无障碍树内', async () => {
    const { container } = await renderList();
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('筛选'))!);

    const backdrop = container.querySelector('.rxdb-filter-backdrop') as HTMLElement;
    const focusables = backdrop.querySelectorAll('button, input, select, textarea, [tabindex]');
    expect(focusables.length).toBeGreaterThan(0);
    expect(hiddenFocusablesIn(backdrop)).toEqual([]);
  });

  it('选择模式：勾选后 onSelectionConfirmed 输出真实实体实例', async () => {
    const a = await seedTodo('select-a');
    await seedTodo('select-b');

    const { confirmed } = await renderList({ mode: 'select' });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });

    const table = tableOf();
    // 选择模式首列是 __selected checkbox（表格 records 带 __selected 字段）
    expect(table.records.every(r => '__selected' in r)).toBe(true);

    const rowA = table.records.findIndex(r => r['id'] === a.id) + 1;
    act(() => {
      table.emit('checkbox_state_change', { col: 1, row: rowA, checked: true });
      table.emit('checkbox_state_change', { col: 1, row: rowA, checked: false });
      table.emit('checkbox_state_change', { col: 1, row: rowA, checked: true });
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain('已选 1 项');
    });

    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '确认添加')!);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].map(e => e.id)).toEqual([a.id]);
  });

  it('选择模式：未选中时确认按钮禁用，取消走 onSelectionCancelled', async () => {
    await seedTodo('nothing-selected');
    const { cancelled } = await renderList({ mode: 'select' });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    // 未选中时确认按钮禁用（confirm 的 UI 层守卫；Angular 侧 confirmSelection 的空选分支同语义）
    const confirmBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '确认添加');
    expect(confirmBtn?.hasAttribute('disabled')).toBe(true);

    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '取消')!);
    expect(cancelled).toHaveLength(1);
  });

  it('行删除走真实 remove 路径并从列表消失', async () => {
    const victim = await seedTodo('delete-me');
    await seedTodo('keep-me');
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });

    const table = tableOf();
    const row = table.records.findIndex(r => r['id'] === victim.id) + 1;
    act(() => {
      table.emit('icon_click', { name: 'delete-action', col: 2, row });
    });

    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });
    expect(await findTitles()).toEqual(['keep-me']);
    void container;
  });

  it('view-action 图标点击输出 onViewEntity 并打开编辑对话框', async () => {
    await seedTodo('view-me');
    const { container, viewed } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('icon_click', { name: 'view-action', col: 2, row: 1 });
    });

    await waitFor(() => {
      expect(viewed).toHaveLength(1);
      const dialog = document.querySelector('.rxdb-dialog-pane');
      expect(dialog).toBeTruthy();
      // edit 模式：表单自带动作为「取消 / 保存」
      expect(dialog?.textContent).toContain('取消');
      expect(dialog?.textContent).toContain('保存');
    });
    // 编辑模式：表单已按记录 id 从仓库加载数据
    await waitFor(() => {
      const inputs = [...document.querySelectorAll('.rxdb-dialog-pane input')];
      expect(inputs.some(i => (i as HTMLInputElement).value === 'view-me')).toBe(true);
    });

    // 清理：点「取消」关闭对话框
    const cancel = [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b =>
      b.textContent?.includes('取消')
    );
    fireEvent.click(cancel!);
    await FLUSH();
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
    void container;
  });

  it('列头排序驱动 cursor orderBy 重查（默认 id desc，点列头切换字段序）', async () => {
    await seedTodo('sort-b');
    await seedTodo('sort-c');
    await seedTodo('sort-a');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(3);
    });

    const table = tableOf();
    act(() => {
      table.emit('sort_click', { field: 'title', order: 'asc' });
    });

    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toEqual(['sort-a', 'sort-b', 'sort-c']);
    });
  });

  it('sort_click 忽略 actions / 非字符串字段（排序保持不变）', async () => {
    await seedTodo('keep-order');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('sort_click', { field: 'actions', order: 'asc' });
      table.emit('sort_click', { field: 42, order: 'desc' });
    });
    await FLUSH();
    await FLUSH();

    // 默认 id desc 未被切换
    expect(tableOf().records.map(r => r['title'])).toEqual(['keep-order']);
  });

  it('批量变更按 recordId 合并批量变更落库（过滤 actions 字段）', async () => {
    const target = await seedTodo('batch-me');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;

    const table = tableOf();
    const row = table.records.findIndex(r => r['id'] === target.id) + 1;
    act(() => {
      table.selectedCellInfos = [[{ col: 2, row, field: 'title' }]];
      table.emit('selected_cell', { col: 2, row });
      table.getElement().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', cancelable: true }));
    });

    // Delete 清空 title → batchUpdated → enqueue → UPDATE
    await waitFor(() => {
      expect(adapter.changes.filter(c => c.type === 'UPDATE').length - updatesBefore).toBeGreaterThan(0);
    });
    // 活查询把新值推到表格记录
    await waitFor(() => {
      expect(tableOf().records[0]['title']).toBe('');
    });
  });

  it('Ctrl+Z / Ctrl+Shift+Z 键盘快捷键驱动 undo / redo', async () => {
    await seedTodo('shortcut-me');
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('change_cell_value', { col: 2, row: 1, changedValue: 'after-edit' });
    });
    const undoBtn = () => container.querySelector('[aria-label="撤销 (Ctrl+Z)"]') as HTMLButtonElement;
    await waitFor(() => {
      expect(undoBtn().disabled).toBe(false);
    });

    const root = container.querySelector('.rxdb-entity-list') as HTMLElement;
    expect(fireEvent.keyDown(root, { key: 'z', ctrlKey: true })).toBe(false);
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toContain('shortcut-me');
    });

    const redoBtn = () => container.querySelector('[aria-label="重做 (Ctrl+Shift+Z)"]') as HTMLButtonElement;
    await waitFor(() => {
      expect(redoBtn().disabled).toBe(false);
    });
    expect(fireEvent.keyDown(root, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(false);
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toContain('after-edit');
    });

    // 输入框内的按键不拦截
    const input = document.createElement('input');
    root.appendChild(input);
    expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true);
  });

  it('creationChain 含当前实体时阻断新增（按钮隐藏、点击不打开对话框）', async () => {
    await seedTodo('blocked');
    const { container } = await renderList({ creationChain: ['public:Todo'] });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    expect(container.textContent).not.toContain('+ 新增');
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
  });

  it('普通实体不显示行拖动手柄（建表开 dragOrder，手柄按可排序判定开关），业务表的行不标只读', async () => {
    await seedTodo('no-drag');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    expect(tableOf().options['rowSeriesNumber']).toEqual({ title: '', width: 40, dragOrder: true });
    expect(isRowDragEnabled(tableOf() as never)).toBe(false);
    expect(tableOf().records.some(r => r['_readonly'] === true)).toBe(false);
  });

  it('系统表整表只读：不提供新增，每一行都标 _readonly', async () => {
    const { container } = await renderList({ namespace: 'rxdb', name: 'RxDBBranch' });
    await waitFor(() => {
      expect(tableOf().records.length).toBeGreaterThan(0);
    });

    expect(container.textContent).not.toContain('+ 新增');
    expect(tableOf().records.every(r => r['_readonly'] === true)).toBe(true);
  });

  describe('US-027 新增 / 编辑 / 删除入口按实体 permissions 派生', () => {
    type IconColumn = { icon: (args: unknown) => Array<{ name: string }> };
    type EditorColumn = { editor: (args: unknown) => unknown };

    /** 列在表格里的序号（col 0 是行序号列） */
    const colOf = (field: string): number => tableOf().columns.findIndex(c => c['field'] === field) + 1;

    /** 某一行操作列给出的图标名（去重） */
    function actionIconNames(row: number): string[] {
      const col = colOf('actions');
      const column = tableOf().columns[col - 1] as unknown as IconColumn;
      return [...new Set(column.icon({ table: tableOf(), col, row }).map(i => i.name))];
    }

    /** 某一行 title 单元格的编辑器（`undefined` 即不可编辑） */
    function titleEditorOf(row: number): unknown {
      const col = colOf('title');
      return (tableOf().columns[col - 1] as unknown as EditorColumn).editor({ table: tableOf(), col, row });
    }

    const rowOf = (id: string): number => tableOf().records.findIndex(r => r['id'] === id) + 1;

    it('AC#10 create: system 的实体不提供新增，已有行照常可编辑可删除', async () => {
      const log = new AuditLog({ message: 'seeded-by-system' });
      await adapter.mutations({
        create: new Map<EntityType, Set<EntityBase>>([[AuditLog as unknown as EntityType, new Set([log])]]),
        update: new Map(),
        remove: new Map()
      });
      const { container } = await renderList({ name: 'AuditLog' });
      await waitFor(() => {
        expect(tableOf().records).toHaveLength(1);
      });

      expect(container.textContent).not.toContain('+ 新增');
      expect(tableOf().records[0]['_readonly']).toBeUndefined();
      expect(actionIconNames(1)).toEqual(['view-action', 'delete-action']);
    });

    it('未声明 permissions 的实体照常提供新增', async () => {
      const { container } = await renderList();

      expect(container.textContent).toContain('+ 新增');
    });

    it('AC#11 update: system 的实体：行只读、单元格无编辑器，删除仍可用并真实删除', async () => {
      const keep = new Invoice({ title: 'keep' });
      const victim = new Invoice({ title: 'victim' });
      await keep.save();
      await victim.save();
      const { container } = await renderList({ name: 'Invoice' });
      await waitFor(() => {
        expect(tableOf().records).toHaveLength(2);
      });

      expect(container.textContent).toContain('+ 新增');
      expect(tableOf().records.every(r => r['_readonly'] === true)).toBe(true);
      const row = rowOf(victim.id);
      expect(titleEditorOf(row)).toBeUndefined();
      expect(actionIconNames(row)).toEqual(['view-action', 'delete-action']);

      act(() => {
        tableOf().emit('icon_click', { name: 'delete-action', col: colOf('actions'), row });
      });
      await waitFor(async () => {
        expect(await titlesOf(Invoice as unknown as EntityType)).toEqual(['keep']);
      });
    });

    it('AC#12 delete: system 的实体：行可编辑并落库，操作列只剩查看', async () => {
      const contract = new Contract({ title: 'draft-terms' });
      await contract.save();
      await renderList({ name: 'Contract' });
      await waitFor(() => {
        expect(tableOf().records).toHaveLength(1);
      });

      const row = rowOf(contract.id);
      expect(tableOf().records[row - 1]['_readonly']).toBeUndefined();
      expect(titleEditorOf(row)).toBeDefined();
      expect(actionIconNames(row)).toEqual(['view-action']);

      act(() => {
        tableOf().emit('change_cell_value', { col: colOf('title'), row, changedValue: 'final-terms' });
      });
      await waitFor(async () => {
        expect(await titlesOf(Contract as unknown as EntityType)).toEqual(['final-terms']);
      });
    });
  });

  it('initialFilter 合法 JSON 载入初始筛选，非法 JSON 静默忽略', async () => {
    await seedTodo('initial-filter-a');
    await seedTodo('initial-filter-b');

    const good = await renderList({
      initialFilter: JSON.stringify({
        combinator: 'and',
        rules: [{ field: 'title', operator: 'contains', value: 'initial-filter' }]
      })
    });
    await waitFor(() => {
      expect(good.container.querySelector('.badge-primary')?.textContent?.trim()).toBe('1');
    });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });
    good.unmount();

    const bad = await renderList({ initialFilter: '{not-json' });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });
    expect(bad.container.querySelector('.badge-primary')).toBeNull();
    bad.unmount();
  });

  it('fixedQuery 单独生效，与用户筛选 AND 合并', async () => {
    await seedTodo('fixed-a');
    await seedTodo('fixed-b');
    await seedTodo('other');

    const { container } = await renderList({
      fixedQuery: {
        combinator: 'and',
        rules: [{ field: 'title', operator: 'contains', value: 'fixed' }]
      }
    });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(2);
    });
    expect(
      tableOf()
        .records.map(r => r['title'])
        .sort()
    ).toEqual(['fixed-a', 'fixed-b']);

    // 固定 + 用户条件 AND 合并
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('筛选'))!);
    configureContainsRule(container);
    fireEvent.change(container.querySelector('input[placeholder="输入值"]') as HTMLInputElement, {
      target: { value: 'fixed-a' }
    });
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.trim() === '确定')!);
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toEqual(['fixed-a']);
    });
  });

  it('未知实体：displayName 回退 name、列回退 actionsColumn、编辑与新增全部安全 no-op', async () => {
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;

    const { container } = await renderList({ name: 'Ghost' });
    await FLUSH();

    expect(container.textContent).toContain('Ghost');
    expect(container.textContent).toContain('暂无数据');
    // 无实体类时按钮照常渲染，但点击为 no-op（createFormFieldConfigs 为空 → openCreateDialog 守卫）
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 新增'))!);
    await FLUSH();
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();

    // 无实体类时 flushPending 直接返回，不产生任何变更
    const table = tableOf();
    act(() => {
      table.emit('change_cell_value', { col: 1, row: 1, changedValue: 'x' });
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - updatesBefore).toBe(0);
  });

  it('MANY_TO_MANY 模式渲染「+ 添加」按钮', async () => {
    await seedTodo('m2m-item');
    const { container } = await renderList({ relationKind: RelationKind.MANY_TO_MANY });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    expect(container.textContent).toContain('+ 添加');
    expect(container.textContent).not.toContain('+ 新增');
  });

  it('键盘：无历史时 Ctrl+Z / Ctrl+Shift+Z 不拦截（独立 RxDB 实例）', async () => {
    // 共享 rxdb 的历史变更日志跨用例只增不减，canUndo 不可控；
    // 用全新实例保证 undoCount 从 0 开始；用完 destroy 解除实体类全局绑定。
    const fresh = createInMemoryRxdb([Todo as unknown as EntityType]);
    await fresh.connect(IN_MEMORY_ADAPTER_NAME);
    try {
      const utils = render(
        <RxDBProvider db={fresh}>
          <EntityList namespace='public' name='Todo' />
        </RxDBProvider>
      );
      await waitFor(() => {
        expect(getLastListTable()).toBeInstanceOf(FakeListTable);
      });
      await FLUSH();

      const root = utils.container.querySelector('.rxdb-entity-list') as HTMLElement;
      expect(fireEvent.keyDown(root, { key: 'z', ctrlKey: true })).toBe(true);
      expect(fireEvent.keyDown(root, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(true);
      utils.unmount();
    } finally {
      await fresh.destroy();
    }
  });

  it('键盘：Meta+Z 触发 undo；TEXTAREA/SELECT/其他键不拦截', async () => {
    await seedTodo('kb-guard');
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('change_cell_value', { col: 2, row: 1, changedValue: 'after-meta' });
    });
    const undoBtn = () => container.querySelector('[aria-label="撤销 (Ctrl+Z)"]') as HTMLButtonElement;
    await waitFor(() => {
      expect(undoBtn().disabled).toBe(false);
    });

    const root = container.querySelector('.rxdb-entity-list') as HTMLElement;
    expect(fireEvent.keyDown(root, { key: 'z', metaKey: true })).toBe(false);
    await waitFor(() => {
      expect(tableOf().records.map(r => r['title'])).toContain('kb-guard');
    });

    // TEXTAREA / SELECT 目标不拦截
    for (const tag of ['textarea', 'select'] as const) {
      const el = document.createElement(tag);
      root.appendChild(el);
      expect(fireEvent.keyDown(el, { key: 'z', ctrlKey: true })).toBe(true);
    }

    // 非 z 键不拦截
    expect(fireEvent.keyDown(root, { key: 'a', ctrlKey: true })).toBe(true);

    // 无修饰键的 z 键不拦截
    expect(fireEvent.keyDown(root, { key: 'z' })).toBe(true);
  });

  it('onCellChanged：actions 列忽略，同值与未知记录不落库', async () => {
    const target = await seedTodo('cell-guard');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;
    const table = tableOf();
    const row = table.records.findIndex(r => r['id'] === target.id) + 1;

    // actions 列（col 6）忽略
    act(() => {
      table.emit('change_cell_value', { col: 6, row, changedValue: 'x' });
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - updatesBefore).toBe(0);

    // 同值编辑不产生 UPDATE
    const beforeSame = adapter.changes.filter(c => c.type === 'UPDATE').length;
    act(() => {
      table.emit('change_cell_value', { col: 2, row, changedValue: 'cell-guard' });
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - beforeSame).toBe(0);

    // 记录 id 不在列表 → flushPending 跳过
    const beforeGhost = adapter.changes.filter(c => c.type === 'UPDATE').length;
    act(() => {
      table.emit('change_cell_value', { col: 2, row: 99, changedValue: 'x' });
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - beforeGhost).toBe(0);
  });

  it('onIconClicked：未知动作与未知记录 id 安全忽略', async () => {
    const target = await seedTodo('icon-guard');
    await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });
    const table = tableOf();
    const row = table.records.findIndex(r => r['id'] === target.id) + 1;

    act(() => {
      table.emit('icon_click', { name: 'other-action', col: 2, row });
      table.emit('icon_click', { name: 'delete-action', col: 2, row: 99 });
    });
    await FLUSH();

    expect(tableOf().records).toHaveLength(1);
  });

  it('选择模式：alreadyLinkedIds 过滤已关联记录', async () => {
    const a = await seedTodo('linked-a');
    const b = await seedTodo('linked-b');
    const { container } = await renderList({ mode: 'select', alreadyLinkedIds: new Set([a.id]) });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    expect(tableOf().records.map(r => r['id'])).toEqual([b.id]);
    void container;
  });

  it('M2M 确认：父实体关系 add + save；无父实体安全 no-op', async () => {
    await seedTodo('m2m-a');
    await seedTodo('m2m-b');
    const add = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const parent = { id: 'p1', save, children$: { add } };
    // 外层列表经 fixedQuery 只覆盖 m2m-a → 内层选择列表只剩 m2m-b 可选（已关联过滤语义）
    await renderList({
      parentEntity: parent as never,
      parentRelationName: 'children',
      relationKind: RelationKind.MANY_TO_MANY,
      fixedQuery: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'm2m-a' }] }
    });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    // 打开 M2M 选择对话框 → 勾选可选项 → 确认
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('+ 添加'))!);
    await waitFor(() => {
      expect(document.querySelector('.rxdb-dialog-pane')).toBeTruthy();
    });

    // 内嵌列表的表格是最后创建的实例
    const inner = getLastListTable();
    await waitFor(() => {
      expect(inner.records).toHaveLength(1);
    });
    expect(inner.records[0]['title']).toBe('m2m-b');
    act(() => {
      inner.emit('checkbox_state_change', { col: 1, row: 1, checked: true });
    });
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '确认添加')!
    );

    await waitFor(() => {
      expect(add).toHaveBeenCalledTimes(1);
    });
    expect(add.mock.calls[0].length).toBe(1);
    await waitFor(() => {
      expect(save).toHaveBeenCalled();
    });

    // 无父实体：打开对话框后确认安全 no-op（parent undefined 分支）
    const lone = await renderList({ relationKind: RelationKind.MANY_TO_MANY });
    await waitFor(() => {
      expect(getLastListTable().records).toHaveLength(2);
    });
    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('+ 添加'))!);
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(1);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(0);
    });
    lone.unmount();
  });

  it('M2M 确认：草稿父实体只合并本地草稿，不 save', async () => {
    await seedTodo('m2m-draft-a');
    await seedTodo('m2m-draft-b');
    const draftAdd = vi.fn();
    const draftSave = vi.fn();
    const draftParent = { id: 'p3', save: draftSave, children$: { add: draftAdd } };
    await renderList({
      parentEntity: draftParent as never,
      parentRelationName: 'children',
      draftParentEntity: draftParent as never,
      relationKind: RelationKind.MANY_TO_MANY,
      fixedQuery: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'm2m-draft-a' }] }
    });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    fireEvent.click([...document.querySelectorAll('button')].find(b => b.textContent?.includes('+ 添加'))!);
    const inner = getLastListTable();
    await waitFor(() => {
      expect(inner.records).toHaveLength(1);
    });
    expect(inner.records[0]['title']).toBe('m2m-draft-b');
    act(() => {
      inner.emit('checkbox_state_change', { col: 1, row: 1, checked: true });
    });
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '确认添加')!
    );

    await waitFor(() => {
      expect(draftAdd).toHaveBeenCalled();
    });
    expect(draftSave).not.toHaveBeenCalled();
  });

  it('openM2mSelectDialog：打开真实对话框、重入被挡、取消后可重开', async () => {
    await seedTodo('m2m-dialog');
    const { container } = await renderList({ relationKind: RelationKind.MANY_TO_MANY });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const addBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 添加'))!;

    // 打开真实对话框
    fireEvent.click(addBtn());
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(1);
    });
    expect(document.querySelector('.rxdb-dialog-pane')?.textContent).toContain('添加Todo');

    // 已打开 → 重入被挡
    fireEvent.click(addBtn());
    expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(1);

    // 取消关闭对话框后允许再次打开
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '取消')!
    );
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(0);
    });

    fireEvent.click(addBtn());
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(1);
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(document.querySelectorAll('.rxdb-dialog-pane').length).toBe(0);
    });
  });

  it('view-action 打开 edit 详情对话框并加载记录数据', async () => {
    await seedTodo('dialog-me');
    const { viewed } = await renderList();
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('icon_click', { name: 'view-action', col: 2, row: 1 });
    });

    await waitFor(() => {
      const dialog = document.querySelector('.rxdb-dialog-pane');
      expect(dialog).toBeTruthy();
      expect(dialog?.textContent).toContain('保存');
    });
    await waitFor(() => {
      const inputs = [...document.querySelectorAll('.rxdb-dialog-pane input')];
      expect(inputs.some(i => (i as HTMLInputElement).value === 'dialog-me')).toBe(true);
    });

    // 清理：Escape 关闭
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
    });
    void viewed;
  });

  it('只读行（系统表）view-action 以 view 模式打开详情：字段只读、无保存入口', async () => {
    await renderList({ namespace: 'rxdb', name: 'RxDBBranch' });
    await waitFor(() => {
      expect(tableOf().records.length).toBeGreaterThan(0);
    });
    const record = tableOf().records[0]!;
    expect(record['_readonly']).toBe(true);

    const table = tableOf();
    act(() => {
      table.emit('icon_click', { name: 'view-action', col: 2, row: 1 });
    });

    await waitFor(() => {
      const form = document.querySelector('.rxdb-dialog-pane form');
      expect(form?.textContent).toContain(record['id'] as string);
      expect(form?.querySelectorAll('input, select, textarea')).toHaveLength(0);
      expect(form?.textContent).not.toContain('保存');
    });

    fireEvent.click(document.querySelector('.rxdb-dialog-pane button[aria-label="关闭"]')!);
    await waitFor(() => {
      expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
    });
  });

  it('editChain 含记录 id 时 view-action 只 emit 不打开编辑对话框（防环）', async () => {
    const chained = await seedTodo('chained');
    const { viewed } = await renderList({ editChain: [chained.id] });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });

    const table = tableOf();
    act(() => {
      table.emit('icon_click', { name: 'view-action', col: 2, row: 1 });
    });
    await FLUSH();

    expect(viewed).toHaveLength(1);
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
  });

  it('草稿行 view-action 只 emit 不打开编辑对话框', async () => {
    await seedTodo('draft-victim');
    await seedTodo('draft-target');
    const draftParent = { id: 'p-draft', save: vi.fn(), children$: { add: vi.fn() } };
    const { container, viewed } = await renderList({
      parentEntity: draftParent as never,
      parentRelationName: 'children',
      draftParentEntity: draftParent as never,
      relationKind: RelationKind.MANY_TO_MANY,
      fixedQuery: { combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'draft-victim' }] }
    });
    await waitFor(() => {
      expect(tableOf().records).toHaveLength(1);
    });
    const outer = tableOf();

    // 行经 M2M 通道进入本地草稿集合（未落库，无法按 id 打开编辑）
    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 添加'))!);
    const inner = getLastListTable();
    await waitFor(() => {
      expect(inner.records).toHaveLength(1);
    });
    expect(inner.records[0]['title']).toBe('draft-target');
    act(() => {
      inner.emit('checkbox_state_change', { col: 1, row: 1, checked: true });
    });
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '确认添加')!
    );
    await waitFor(() => {
      expect(outer.records.length).toBe(2);
    });

    // 外层表格首行是草稿副本 → view-action 只 emit 不打开
    act(() => {
      outer.emit('icon_click', { name: 'view-action', col: 2, row: 1 });
    });
    await FLUSH();

    expect(viewed).toHaveLength(1);
    expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
  });

  it('新增对话框：+ 新增 打开 create 详情对话框，保存后列表刷新', async () => {
    const { container } = await renderList();
    await waitFor(() => {
      expect(tableOf()).toBeInstanceOf(FakeListTable);
    });

    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 新增'))!);
    await waitFor(() => {
      const dialog = document.querySelector('.rxdb-dialog-pane');
      expect(dialog?.textContent).toContain('新建Todo');
      expect(dialog?.querySelector('[role="tab"]')).toBeTruthy();
    });

    // create 模式：填必填字段（Todo.title 非必填）→ 保存 → 关闭并落库
    const titleInput = [...document.querySelectorAll('.rxdb-dialog-pane [data-field="title"] input')][0] as
      HTMLInputElement | undefined;
    fireEvent.change(titleInput!, { target: { value: 'created-via-dialog' } });
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '保存')!
    );

    await waitFor(async () => {
      expect(await findTitles()).toContain('created-via-dialog');
    });
    await waitFor(() => {
      expect(document.querySelector('.rxdb-dialog-pane')).toBeNull();
    });
  });

  it('级联新增：draftParentEntity 存在时表单保存进本地草稿（不落库）', async () => {
    const draftParent = { id: 'p-cascade', save: vi.fn(), children$: { add: vi.fn() } };
    const { container } = await renderList({
      parentEntity: draftParent as never,
      parentRelationName: 'children',
      draftParentEntity: draftParent as never
    });
    await waitFor(() => {
      expect(tableOf()).toBeInstanceOf(FakeListTable);
    });

    fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 新增'))!);
    await waitFor(() => {
      expect(document.querySelector('.rxdb-dialog-pane')).toBeTruthy();
    });

    fireEvent.change(
      [...document.querySelectorAll('.rxdb-dialog-pane [data-field="title"] input')][0] as HTMLInputElement,
      { target: { value: 'draft-child' } }
    );
    fireEvent.click(
      [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '保存')!
    );

    // 级联新增：父关系 add + 本地草稿并入列表（不写 DB）
    await waitFor(() => {
      expect(tableOf().records.some(r => r['title'] === 'draft-child')).toBe(true);
    });
    expect(await findTitles()).not.toContain('draft-child');
    void container;
  });

  describe('手动排序（US-028 阶段 B）', () => {
    /** 钉住「进行中」一组：Task 按 completed 分组排序 */
    const ACTIVE_ONLY = {
      combinator: 'and' as const,
      rules: [{ field: 'completed', operator: '=', value: false }]
    };
    const taskRepo = () => rxdb.entityManager.getRepository(Task as unknown as EntityType);

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function seedTasks(...titles: string[]): Promise<void> {
      for (const title of titles) await new Task({ title, completed: false }).save();
    }

    const tableTitles = (): unknown[] => tableOf().records.map(r => r['title']);
    const dragEnabled = (): boolean => isRowDragEnabled(tableOf() as never);

    /** 数据库里进行中任务的手动顺序（不带 orderBy，核心补默认排序） */
    const dbTaskTitles = async (): Promise<string[]> => {
      const seen: string[][] = [];
      const subscription = taskRepo()
        .find({ where: ACTIVE_ONLY } as never)
        .subscribe(rows => seen.push(rows.map(r => (r as unknown as { title: string }).title)));
      await FLUSH();
      await FLUSH();
      subscription.unsubscribe();
      return seen.at(-1) ?? [];
    };

    /** 挂载钉住单组的 Task 列表，等三行按手动顺序显示且拖拽可用 */
    async function renderActiveTasks() {
      await seedTasks('甲', '乙', '丙');
      const utils = await renderList({ name: 'Task', fixedQuery: ACTIVE_ONLY });
      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙', '丙']);
        expect(dragEnabled()).toBe(true);
      });
      return utils;
    }

    it('分组排序实体没有钉住单组时不显示手柄，被拒的拖放零写入并恢复原顺序', async () => {
      await seedTasks('甲', '乙');
      const reorder = vi.spyOn(taskRepo(), 'reorder');
      await renderList({ name: 'Task' });
      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙']);
      });
      expect(dragEnabled()).toBe(false);

      act(() => tableOf().dragRow(2, 1));
      await FLUSH();

      expect(tableTitles()).toEqual(['甲', '乙']);
      expect(reorder).not.toHaveBeenCalled();
    });

    it('钉住单组后按手动顺序显示，拖放按界面上的邻居落库', async () => {
      await renderActiveTasks();

      act(() => tableOf().dragRow(3, 1));

      await waitFor(async () => {
        expect(await dbTaskTitles()).toEqual(['丙', '甲', '乙']);
      });
      await waitFor(() => {
        expect(tableTitles()).toEqual(['丙', '甲', '乙']);
        expect(dragEnabled()).toBe(true);
      });
    });

    it('按列排序时收起手柄，回到默认排序后恢复', async () => {
      await renderActiveTasks();

      act(() => tableOf().emit('sort_click', { field: 'title', order: 'desc' }));
      await waitFor(() => {
        expect(dragEnabled()).toBe(false);
      });

      act(() => tableOf().emit('sort_click', { field: 'title', order: 'normal' }));
      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙', '丙']);
        expect(dragEnabled()).toBe(true);
      });
    });

    it('有未完成的行内编辑时收起手柄，落库后恢复', async () => {
      await renderActiveTasks();
      const reorder = vi.spyOn(taskRepo(), 'reorder');
      const row = tableOf().records.findIndex(r => r['title'] === '乙') + 1;
      const col = tableOf().columns.findIndex(column => column['field'] === 'title') + 1;

      act(() => {
        tableOf().emit('change_cell_value', { col, row, changedValue: '乙改' });
        // 同一同步段里的拖放：编辑还在排队，判定为不允许
        tableOf().dragRow(3, 1);
      });

      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙改', '丙']);
        expect(dragEnabled()).toBe(true);
      });
      expect(reorder).not.toHaveBeenCalled();
    });

    it('落库失败时显示错误并恢复原顺序，下一次拖放照常可用', async () => {
      const { container } = await renderActiveTasks();
      const reorder = vi.spyOn(taskRepo(), 'reorder').mockRejectedValueOnce(new Error('写入被拒'));

      act(() => tableOf().dragRow(3, 1));

      await waitFor(() => {
        expect(container.querySelector('[role="alert"]')?.textContent).toContain('写入被拒');
        expect(tableTitles()).toEqual(['甲', '乙', '丙']);
        expect(dragEnabled()).toBe(true);
      });

      act(() => tableOf().dragRow(1, 3));
      await waitFor(async () => {
        expect(await dbTaskTitles()).toEqual(['乙', '丙', '甲']);
      });
      await waitFor(() => {
        expect(container.querySelector('[role="alert"]')).toBeNull();
      });
      expect(reorder).toHaveBeenCalledTimes(2);
    });

    it('重排落库中拒绝新的拖放（不排队），落定后手柄恢复', async () => {
      await renderActiveTasks();
      const repo = taskRepo();
      const original = repo.reorder.bind(repo);
      let release: () => void = () => undefined;
      const gate = new Promise<void>(resolve => (release = resolve));
      const reorder = vi
        .spyOn(repo, 'reorder')
        .mockImplementationOnce((...args: Parameters<typeof original>) => gate.then(() => original(...args)));

      act(() => {
        tableOf().dragRow(3, 1);
        tableOf().dragRow(1, 3);
      });
      await waitFor(() => {
        expect(dragEnabled()).toBe(false);
      });
      expect(reorder).toHaveBeenCalledOnce();

      act(() => release());
      await waitFor(async () => {
        expect(await dbTaskTitles()).toEqual(['丙', '甲', '乙']);
      });
      await waitFor(() => {
        expect(tableTitles()).toEqual(['丙', '甲', '乙']);
        expect(dragEnabled()).toBe(true);
      });
    });

    it('AC#7 update: system 的可排序实体整表不开手柄，强制拖放零写入、sortOrder 不变', async () => {
      for (const title of ['甲', '乙']) await new LockedTask({ title }).save();
      const reorder = vi.spyOn(rxdb.entityManager.getRepository(LockedTask as unknown as EntityType), 'reorder');
      await renderList({ namespace: 'test', name: 'LockedTask' });
      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙']);
        expect(tableOf().records.every(r => r['_readonly'] === true)).toBe(true);
      });
      const keys = tableOf().records.map(r => r['sortOrder']);
      expect(dragEnabled()).toBe(false);

      act(() => tableOf().dragRow(2, 1));
      await FLUSH();

      await waitFor(() => {
        expect(tableTitles()).toEqual(['甲', '乙']);
      });
      expect(tableOf().records.map(r => r['sortOrder'])).toEqual(keys);
      expect(reorder).not.toHaveBeenCalled();
    });
  });

  it('注册表条目不是构造器时新增提交安全 no-op（不抛 TypeError）', async () => {
    // 元数据经原型链仍可读（Object.create(Todo)），但 `new cls(data)` 会抛 TypeError ——
    // handleCreateSubmit 的 typeof 守卫应把这类损坏注册表降级为静默 no-op。
    const corrupt = createInMemoryRxdb([Object.create(Todo) as unknown as EntityType]);
    await corrupt.connect(IN_MEMORY_ADAPTER_NAME);
    try {
      const { container } = render(
        <RxDBProvider db={corrupt}>
          <EntityList namespace='public' name='Todo' />
        </RxDBProvider>
      );
      await waitFor(() => {
        expect(getLastListTable()).toBeInstanceOf(FakeListTable);
      });
      await FLUSH();

      fireEvent.click([...container.querySelectorAll('button')].find(b => b.textContent?.includes('+ 新增'))!);
      await waitFor(() => {
        expect(document.querySelector('.rxdb-dialog-pane')).toBeTruthy();
      });

      fireEvent.change(
        [...document.querySelectorAll('.rxdb-dialog-pane [data-field="title"] input')][0] as HTMLInputElement,
        { target: { value: 'should-not-save' } }
      );
      fireEvent.click(
        [...document.querySelectorAll('.rxdb-dialog-pane button')].find(b => b.textContent?.trim() === '保存')!
      );

      await FLUSH();
      expect(tableOf().records.some(r => r['title'] === 'should-not-save')).toBe(false);
    } finally {
      await corrupt.destroy();
    }
  });
});
