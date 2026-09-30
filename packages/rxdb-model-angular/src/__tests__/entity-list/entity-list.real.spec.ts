import { RelationKind, RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityTableRecord } from '@aiao/rxdb-model';
import { Todo } from '@aiao/rxdb-test/entities';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityListComponent } from '../../entity-list/entity-list.component';
import { QueryTableComponent } from '../../entity-table/query-table/query-table.component';
import { FakeListTable } from '../testing/fake-vtable';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';

// VTable 引擎打桩（列表经 query-table → entity-table 渲染真实组件链，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * EntityListComponent —— **真实组件源码**。
 *
 * 覆盖 namespace/name → InfiniteScrollingList 无限滚动加载、行内编辑批量合并
 * （真实 VTable 事件 → cellChanged → #enqueue → entityManager.mutations）、
 * 撤销/重做（真实 @aiao/rxdb-plugin-history）、筛选弹层（CDK Overlay + QueryBuilder）、
 * 选择模式 selectionConfirmed 输出与行删除。数据源为 `@aiao/rxdb-test/entities` 的
 * Todo 实体 + 内存本地适配器，查询语义全部来自 @aiao/rxdb 核心。
 */

describe('EntityListComponent（真实组件）', () => {
  let rxdb: RxDB;
  let adapter: InMemoryRxDBAdapter;

  beforeAll(async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          // happy-dom 无 ResizeObserver
        }
        unobserve(): void {
          // no-op
        }
        disconnect(): void {
          // no-op
        }
      }
    );
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        #listeners = new Set<(event: MessageEvent) => void>();
        addEventListener(_type: string, listener: (event: MessageEvent) => void): void {
          this.#listeners.add(listener);
        }
        removeEventListener(_type: string, listener: (event: MessageEvent) => void): void {
          this.#listeners.delete(listener);
        }
        postMessage(): void {
          // 单 tab 测试：不回环投递
        }
        close(): void {
          this.#listeners.clear();
        }
      }
    );
    rxdb = createInMemoryRxdb([Todo as unknown as EntityType]);
    await rxdb.connect(IN_MEMORY_ADAPTER_NAME);
    const { firstValueFrom } = await import('rxjs');
    adapter = (await firstValueFrom(rxdb.localAdapter$)) as unknown as InMemoryRxDBAdapter;
  });

  beforeEach(() => {
    adapter.resetData();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: RxDB, useValue: rxdb }]
    });
  });

  /** 落库一条 Todo 并返回实例。 */
  async function seedTodo(title: string, completed = false): Promise<Todo> {
    const todo = new Todo({ title, completed });
    await todo.save();
    return todo;
  }

  /** 挂载列表组件并等待首页加载完成。 */
  async function renderList(inputs: Partial<{ namespace: string; name: string; mode: 'default' | 'select' }> = {}) {
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', inputs.namespace ?? 'public');
    fixture.componentRef.setInput('name', inputs.name ?? 'Todo');
    if (inputs.mode) fixture.componentRef.setInput('mode', inputs.mode);
    const confirmed: Array<Array<{ id: string }>> = [];
    const cancelled: unknown[] = [];
    const viewed: EntityTableRecord[] = [];
    component.selectionConfirmed.subscribe(e => confirmed.push(e));
    component.selectionCancelled.subscribe(() => cancelled.push(null));
    component.viewEntity.subscribe(e => viewed.push(e));
    fixture.detectChanges();
    await FLUSH();
    return { fixture, component, confirmed, cancelled, viewed };
  }

  /** 列表渲染树里的真实表格引擎实例（entity-list → query-table → entity-table）。 */
  function tableOf(fixture: ComponentFixture<EntityListComponent>): FakeListTable {
    const queryTable = fixture.debugElement.query(By.directive(QueryTableComponent));
    return queryTable.componentInstance.tableInstance as unknown as FakeListTable;
  }

  const repoOf = () => rxdb.entityManager.getRepository(Todo as unknown as EntityType);
  /**
   * 查询当前落库的 title 列表（升序）。
   *
   * @remarks 活查询任务可能跨用例驻留（历史管理器/未退订订阅持有），
   * 首次发射可能是热启动的旧缓存 —— 等增量合并落地后取最后一次发射。
   */
  const findTitles = async (): Promise<string[]> => {
    const seen: string[][] = [];
    const subscription = repoOf()
      .find({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'title', sort: 'asc' }] } as never)
      .subscribe(rows => seen.push(rows.map(r => (r as unknown as { title: string }).title)));
    await FLUSH();
    await FLUSH();
    subscription.unsubscribe();
    return seen.at(-1) ?? [];
  };

  it('namespace/name 输入驱动 InfiniteScrollingList 加载真实数据', async () => {
    await seedTodo('alpha');
    await seedTodo('beta');

    const { fixture, component } = await renderList();
    await FLUSH();

    expect(fixture.nativeElement.textContent).toContain('Todo');
    expect(component.tableRecords()).toHaveLength(2);
    const titles = component
      .tableRecords()
      .map(r => r['title'])
      .sort();
    expect(titles).toEqual(['alpha', 'beta']);
  });

  it('行内编辑经真实事件链（VTable → cellChanged → mutations）批量合并落库', async () => {
    const a = await seedTodo('before-edit');
    const { fixture, component } = await renderList();
    await FLUSH();

    // 真实事件链：表格引擎事件 → EntityTableComponent → QueryTableComponent → 本组件
    const table = tableOf(fixture);
    const columns = component.tableColumns() as Array<{ field?: string }>;
    const titleCol = columns.findIndex(c => c.field === 'title') + 1;
    const completedCol = columns.findIndex(c => c.field === 'completed') + 1;
    const row = component.tableRecords().findIndex(r => r['id'] === a.id) + 1;

    // 同一行两个字段的连续编辑：进入同一个合并批次
    table.emit('change_cell_value', { col: titleCol, row, changedValue: 'merged-title' });
    table.emit('checkbox_state_change', { col: completedCol, row, checked: true });
    await FLUSH();

    expect(await findTitles()).toEqual(['merged-title']);
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
    expect(component.tableRecords()[0]['title']).toBe('merged-title');
  });

  it('undo / redo 恢复与重放行内编辑（真实历史插件）', async () => {
    await seedTodo('undo-me');
    const { component } = await renderList();
    await FLUSH();
    const before = component.undoCount();

    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'title',
      value: 'changed',
      record: component.tableRecords()[0]
    });
    // 变更行 → 历史活查询 → undoCount$ 是异步增量链，轮询等待收敛
    await vi.waitFor(() => {
      expect(component.undoCount()).toBe(before + 1);
    });
    expect(component.canUndo()).toBe(true);

    component.undo();
    await vi.waitFor(() => {
      expect(component.tableRecords().map(r => r['title'])).toContain('undo-me');
    });
    expect(component.canRedo()).toBe(true);

    component.redo();
    await vi.waitFor(() => {
      expect(component.tableRecords().map(r => r['title'])).toContain('changed');
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

  it('筛选弹层：query-builder 条件应用后列表按 where 重查', async () => {
    await seedTodo('match-alpha');
    await seedTodo('match-beta');
    await seedTodo('other');

    const { fixture, component } = await renderList();
    await FLUSH();
    expect(component.tableRecords()).toHaveLength(3);

    // 打开弹层 → CDK Overlay 渲染真实 QueryBuilderComponent
    component.toggleFilterPopover();
    fixture.detectChanges();
    const overlay = document.body.querySelector('.cdk-overlay-container');
    expect(overlay).toBeTruthy();
    expect(overlay?.textContent).toContain('确定');

    // 用户输入条件 → 应用 → 列表按真实 where 过滤
    component.onQueryChange({
      combinator: 'and',
      rules: [{ field: 'title', operator: 'contains', value: 'match' }]
    });
    component.applyFilter();
    await FLUSH();
    await FLUSH();

    expect(component.isQueryActive()).toBe(true);
    expect(component.filteredCount()).toBe(2);
    expect(
      component
        .tableRecords()
        .map(r => r['title'])
        .sort()
    ).toEqual(['match-alpha', 'match-beta']);

    // 重置筛选恢复全量
    component.resetFilter();
    await FLUSH();
    await FLUSH();
    expect(component.isQueryActive()).toBe(false);
    expect(component.tableRecords()).toHaveLength(3);
  });

  it('筛选弹层的可聚焦控件必须留在无障碍树内', async () => {
    const { fixture, component } = await renderList();
    await FLUSH();

    component.toggleFilterPopover();
    fixture.detectChanges();

    const overlay = document.body.querySelector('.cdk-overlay-container') as HTMLElement;
    const focusables = overlay.querySelectorAll('button, input, select, textarea, [tabindex]');
    expect(focusables.length).toBeGreaterThan(0);
    expect(hiddenFocusablesIn(overlay)).toEqual([]);
  });

  it('选择模式：勾选后 selectionConfirmed 输出真实实体实例', async () => {
    const a = await seedTodo('select-a');
    await seedTodo('select-b');

    const { component, confirmed } = await renderList({ mode: 'select' });
    await FLUSH();

    // 选择模式首列是 __selected checkbox
    const columns = component.tableColumns() as Array<{ field?: string }>;
    expect(columns[0].field).toBe('__selected');

    component.onCellChanged({
      col: 1,
      row: 1,
      field: '__selected',
      value: true,
      record: { id: a.id } as EntityTableRecord
    });
    component.onCellChanged({
      col: 1,
      row: 1,
      field: '__selected',
      value: false,
      record: { id: 'nobody' } as EntityTableRecord
    });

    expect(component.selectedCount()).toBe(1);
    component.confirmSelection();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].map(e => e.id)).toEqual([a.id]);
  });

  it('选择模式：未选中时 confirm 走 selectionCancelled', async () => {
    await seedTodo('nothing-selected');
    const { component, cancelled } = await renderList({ mode: 'select' });
    await FLUSH();

    component.confirmSelection();
    expect(cancelled).toHaveLength(1);

    component.cancelSelection();
    expect(cancelled).toHaveLength(2);
  });

  it('行删除走真实 remove 路径并从列表消失', async () => {
    const victim = await seedTodo('delete-me');
    await seedTodo('keep-me');
    const { component } = await renderList();
    await FLUSH();
    expect(component.tableRecords()).toHaveLength(2);

    await component.onRowDeleted({ id: victim.id });
    await FLUSH();

    expect(component.tableRecords()).toHaveLength(1);
    expect(await findTitles()).toEqual(['keep-me']);
  });

  it('view-action 图标点击输出 viewEntity', async () => {
    await seedTodo('view-me');
    const { component, viewed } = await renderList();
    await FLUSH();
    const record = component.tableRecords()[0];

    await component.onIconClicked({ name: 'view-action', record });

    expect(viewed).toEqual([record]);
  });

  it('view-action 懒加载对话框在组件销毁后不再打开（防 NG0205 竞态）', async () => {
    await seedTodo('destroy-race');
    const { fixture, component, viewed } = await renderList();
    await FLUSH();
    const record = component.tableRecords()[0];

    // 预热懒加载 chunk：让组件内 import() 在微任务内即完成，旧实现会在销毁后仍打开对话框
    await import('../../entity-detail/entity-detail');

    const openPromise = component.onIconClicked({ name: 'view-action', record });
    fixture.destroy();
    await openPromise;
    await FLUSH();
    await FLUSH();

    expect(viewed).toEqual([record]);
    expect(document.body.querySelector('.cdk-dialog-container')).toBeNull();
  });

  it('列头排序驱动 cursor orderBy 重查（默认 id desc，点列头切换字段序）', async () => {
    await seedTodo('sort-b');
    await seedTodo('sort-c');
    await seedTodo('sort-a');
    const { component } = await renderList();
    await FLUSH();

    component.onSortClicked({ field: 'title', order: 'asc' });
    await FLUSH();
    await FLUSH();

    expect(component.tableRecords().map(r => r['title'])).toEqual(['sort-a', 'sort-b', 'sort-c']);
  });

  it('onSortClicked 忽略 actions / 非字符串字段（排序保持不变）', async () => {
    await seedTodo('keep-order');
    const { component } = await renderList();
    await FLUSH();

    component.onSortClicked({ field: 'actions', order: 'asc' });
    component.onSortClicked({ field: 42, order: 'desc' });
    await FLUSH();
    await FLUSH();

    // 默认 id desc 未被切换
    expect(component.tableRecords().map(r => r['title'])).toEqual(['keep-order']);
  });

  it('onBatchUpdated 按 recordId 合并批量变更落库（过滤 actions 字段）', async () => {
    const target = await seedTodo('batch-me');
    const { component } = await renderList();
    await FLUSH();
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;

    component.onBatchUpdated([
      { recordId: target.id, changes: { title: 'batch-done', actions: 'ignored' } },
      { recordId: target.id, changes: { completed: true } }
    ]);
    await vi.waitFor(() => {
      expect(component.tableRecords()[0]['title']).toBe('batch-done');
    });

    expect(component.tableRecords()[0]['completed']).toBe(true);
    // 同一行两条批量变更合并成一条 UPDATE（变更日志跨用例只增不减，按增量断言）
    const updates = adapter.changes.filter(c => c.type === 'UPDATE');
    expect(updates.length - updatesBefore).toBe(1);
    expect(updates.at(-1)!.patch).toMatchObject({ title: 'batch-done', completed: true });
    expect(updates.at(-1)!.patch).not.toHaveProperty('actions');
  });

  it('Ctrl+Z / Ctrl+Shift+Z 键盘快捷键驱动 undo / redo', async () => {
    await seedTodo('shortcut-me');
    const { fixture, component } = await renderList();
    await FLUSH();

    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'title',
      value: 'after-edit',
      record: component.tableRecords()[0]
    });
    await vi.waitFor(() => {
      expect(component.canUndo()).toBe(true);
    });

    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(component.tableRecords().map(r => r['title'])).toContain('shortcut-me');
    });
    await vi.waitFor(() => {
      expect(component.canRedo()).toBe(true);
    });

    fixture.nativeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, cancelable: true })
    );
    await vi.waitFor(() => {
      expect(component.tableRecords().map(r => r['title'])).toContain('after-edit');
    });

    // 输入框内的按键不拦截
    const input = document.createElement('input');
    const inputEvent = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
    Object.defineProperty(inputEvent, 'target', { value: input });
    fixture.nativeElement.dispatchEvent(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
  });

  it('creationChain 含当前实体时阻断新增（按钮隐藏、openCreateDialog 为 no-op）', async () => {
    await seedTodo('blocked');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('creationChain', ['public:Todo']);
    fixture.detectChanges();
    await FLUSH();

    expect(component.isCreateBlocked()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('+ 新增');

    expect(() => component.openCreateDialog()).not.toThrow();
    expect(document.body.querySelector('.cdk-overlay-container')).toBeNull();
  });

  it('行序号列不带拖拽手柄（列表不接 rowReordered，拖完不落库），业务表的行不标只读', async () => {
    await seedTodo('no-drag');
    const { fixture, component } = await renderList();
    await FLUSH();

    expect(tableOf(fixture).options['rowSeriesNumber']).toEqual({ title: '', width: 40, dragOrder: false });
    expect(component.tableRecords()).toHaveLength(1);
    expect(component.tableRecords().some(r => r['_readonly'] === true)).toBe(false);
  });

  it('系统表整表只读：不提供新增，每一行都标 _readonly', async () => {
    const { fixture, component } = await renderList({ namespace: 'rxdb', name: 'RxDBBranch' });
    await FLUSH();

    expect(component.isCreateBlocked()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain('+ 新增');
    expect(component.tableRecords().length).toBeGreaterThan(0);
    expect(component.tableRecords().every(r => r['_readonly'] === true)).toBe(true);
  });

  it('onQueryChange / onValidationChange 驱动筛选弹层状态与按钮可用性', async () => {
    await seedTodo('filter-guard');
    const { component } = await renderList();
    await FLUSH();

    component.toggleFilterPopover();
    component.onQueryChange({ combinator: 'and', rules: [{ field: 'title', operator: '=', value: 'x' }] });
    component.onValidationChange({ valid: false });

    expect(component.pendingQuery().rules).toHaveLength(1);
    expect(component.pendingQueryValid()).toBe(false);

    component.onValidationChange({ valid: true });
    expect(component.pendingQueryValid()).toBe(true);
  });

  // ── 以下为覆盖率补充用例（只加不改既有用例） ─────────────────────────────

  it('initialFilter 合法 JSON 载入初始筛选，非法 JSON 静默忽略', async () => {
    await seedTodo('initial-filter-a');
    await seedTodo('initial-filter-b');

    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput(
      'initialFilter',
      JSON.stringify({ combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: 'initial-filter' }] })
    );
    fixture.detectChanges();
    await FLUSH();
    await FLUSH();

    expect(component.isQueryActive()).toBe(true);
    expect(component.filterQuery().rules).toHaveLength(1);
    expect(component.tableRecords()).toHaveLength(2);

    // 非法 JSON：保持空筛选且不抛错
    const bad = TestBed.createComponent(EntityListComponent);
    const badComponent = bad.componentInstance;
    bad.componentRef.setInput('namespace', 'public');
    bad.componentRef.setInput('name', 'Todo');
    bad.componentRef.setInput('initialFilter', '{not-json');
    bad.detectChanges();
    await FLUSH();
    await FLUSH();
    expect(badComponent.isQueryActive()).toBe(false);
    expect(badComponent.tableRecords()).toHaveLength(2);
  });

  it('fixedQuery 单独生效，与用户筛选 AND 合并', async () => {
    await seedTodo('fixed-a');
    await seedTodo('fixed-b');
    await seedTodo('other');

    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('fixedQuery', {
      combinator: 'and',
      rules: [{ field: 'title', operator: 'contains', value: 'fixed' }]
    });
    fixture.detectChanges();
    await FLUSH();
    await FLUSH();

    // 仅固定条件（用户筛选为空）
    expect(
      component
        .tableRecords()
        .map(r => r['title'])
        .sort()
    ).toEqual(['fixed-a', 'fixed-b']);

    // 固定 + 用户条件 AND 合并
    component.onQueryChange({
      combinator: 'and',
      rules: [{ field: 'title', operator: 'contains', value: 'fixed-a' }]
    });
    component.applyFilter();
    await FLUSH();
    await FLUSH();
    expect(component.tableRecords().map(r => r['title'])).toEqual(['fixed-a']);
  });

  it('未知实体：displayName 回退 name、列回退 actionsColumn、编辑与新增全部安全 no-op', async () => {
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;

    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Ghost');
    fixture.detectChanges();
    await FLUSH();

    expect(component.displayName()).toBe('Ghost');
    expect(component.tableRecords()).toEqual([]);
    expect((component.tableColumns() as Array<{ title?: string }>)[0]?.title).toBe('操作');
    expect(component.createFormFieldConfigs()).toEqual([]);
    expect(component.queryBuilderFields()).toEqual([]);
    expect((component as unknown as { loadMore(): unknown }).loadMore()).toBeUndefined();
    expect(() => component.openCreateDialog()).not.toThrow();

    // 无实体类时 flushPending 直接返回，不产生任何变更
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'title',
      value: 'x',
      record: { id: 'ghost-id' } as EntityTableRecord
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - updatesBefore).toBe(0);
  });

  it('MANY_TO_MANY 模式渲染「+ 添加」按钮并暴露 isM2m', async () => {
    await seedTodo('m2m-item');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('relationKind', RelationKind.MANY_TO_MANY);
    fixture.detectChanges();
    await FLUSH();

    expect(component.isM2m()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('+ 添加');
    expect(el.textContent).not.toContain('+ 新增');
  });

  it('键盘：无历史时 Ctrl+Z / Ctrl+Shift+Z 不拦截（独立 RxDB 实例）', async () => {
    // 共享 rxdb 的历史变更日志跨用例只增不减，canUndo 不可控；
    // 用全新实例保证 undoCount 从 0 开始；用完 destroy 解除实体类全局绑定，
    // 否则后续用例 new Todo() 会撞上「multiple RxDB instances」。
    const fresh = createInMemoryRxdb([Todo as unknown as EntityType]);
    await fresh.connect(IN_MEMORY_ADAPTER_NAME);
    try {
      TestBed.overrideProvider(RxDB, { useValue: fresh });
      const fixture = TestBed.createComponent(EntityListComponent);
      const component = fixture.componentInstance;
      fixture.componentRef.setInput('namespace', 'public');
      fixture.componentRef.setInput('name', 'Todo');
      fixture.detectChanges();
      await FLUSH();

      expect(component.canUndo()).toBe(false);
      expect(component.canRedo()).toBe(false);
      const el = fixture.nativeElement as HTMLElement;

      const noopUndo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
      el.dispatchEvent(noopUndo);
      expect(noopUndo.defaultPrevented).toBe(false);

      const noopRedo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, cancelable: true });
      el.dispatchEvent(noopRedo);
      expect(noopRedo.defaultPrevented).toBe(false);

      fixture.destroy();
    } finally {
      await fresh.destroy();
    }
  });

  it('键盘：Meta+Z 触发 undo；TEXTAREA/SELECT/其他键不拦截', async () => {
    await seedTodo('kb-guard');
    const { fixture, component } = await renderList();
    await FLUSH();
    const el = fixture.nativeElement as HTMLElement;

    // Meta+Z（macOS 习惯）与 Ctrl+Z 同效
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'title',
      value: 'after-meta',
      record: component.tableRecords()[0]
    });
    await vi.waitFor(() => {
      expect(component.canUndo()).toBe(true);
    });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(component.tableRecords().map(r => r['title'])).toContain('kb-guard');
    });

    // TEXTAREA / SELECT 目标不拦截
    for (const tag of ['textarea', 'select'] as const) {
      const evt = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true });
      Object.defineProperty(evt, 'target', { value: document.createElement(tag) });
      el.dispatchEvent(evt);
      expect(evt.defaultPrevented).toBe(false);
    }

    // 非 z 键不拦截
    const other = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true });
    el.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);

    // 无修饰键的 z 键不拦截
    const bareZ = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    el.dispatchEvent(bareZ);
    expect(bareZ.defaultPrevented).toBe(false);
  });

  it('onCellChanged：空字段/actions 忽略，未知字段原样入变更，同值与未知记录不落库', async () => {
    const target = await seedTodo('cell-guard');
    const { component } = await renderList();
    await FLUSH();
    const updatesBefore = adapter.changes.filter(c => c.type === 'UPDATE').length;

    component.onCellChanged({ col: 1, row: 1, field: '', value: 'x', record: { id: target.id } as EntityTableRecord });
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'actions',
      value: 'x',
      record: { id: target.id } as EntityTableRecord
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - updatesBefore).toBe(0);

    // 未知字段没有元数据 → 不做类型解析，原样写入
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'mystery',
      value: 'raw',
      record: { id: target.id } as EntityTableRecord
    });
    await FLUSH();
    const mystery = adapter.changes.filter(c => c.type === 'UPDATE').at(-1)!;
    expect(mystery.patch).toMatchObject({ mystery: 'raw' });

    // 同值编辑不产生 UPDATE
    const beforeSame = adapter.changes.filter(c => c.type === 'UPDATE').length;
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'mystery',
      value: 'raw',
      record: { id: target.id } as EntityTableRecord
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - beforeSame).toBe(0);

    // 记录 id 不在列表 → flushPending 跳过
    const beforeGhost = adapter.changes.filter(c => c.type === 'UPDATE').length;
    component.onCellChanged({
      col: 1,
      row: 1,
      field: 'title',
      value: 'x',
      record: { id: 'ghost-id' } as EntityTableRecord
    });
    await FLUSH();
    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - beforeGhost).toBe(0);
  });

  it('onIconClicked：未知动作与未知记录 id 安全忽略', async () => {
    const target = await seedTodo('icon-guard');
    const { component } = await renderList();
    await FLUSH();

    component.onIconClicked({ name: 'other-action', record: { id: target.id } });
    component.onIconClicked({ name: 'delete-action', record: { id: 'ghost-id' } });
    await FLUSH();

    expect(component.tableRecords()).toHaveLength(1);
  });

  it('onBatchUpdated：全 actions（含空键）变更不落库', async () => {
    const target = await seedTodo('batch-guard');
    const { component } = await renderList();
    await FLUSH();
    const before = adapter.changes.filter(c => c.type === 'UPDATE').length;

    component.onBatchUpdated([{ recordId: target.id, changes: { actions: 'x', '': 'y' } }]);
    await FLUSH();

    expect(adapter.changes.filter(c => c.type === 'UPDATE').length - before).toBe(0);
  });

  it('onSortClicked：空白字段忽略，非法 order 回退 normal，大写 DESC 生效', async () => {
    await seedTodo('sort-x');
    await seedTodo('sort-y');
    const { component } = await renderList();
    await FLUSH();

    component.onSortClicked({ field: '   ', order: 'asc' });
    component.onSortClicked({ field: 'title', order: 42 });
    component.onSortClicked({ field: 'title', order: 'diagonal' });
    await FLUSH();
    await FLUSH();
    // 非法输入不改变默认 id desc 排序
    expect(component.tableRecords()).toHaveLength(2);

    component.onSortClicked({ field: 'title', order: 'DESC' });
    await FLUSH();
    await FLUSH();
    expect(component.tableRecords().map(r => r['title'])).toEqual(['sort-y', 'sort-x']);
  });

  it('选择模式：alreadyLinkedIds 过滤已关联记录，m2mAlreadyLinkedIds 合并 db 与草稿', async () => {
    const a = await seedTodo('linked-a');
    const b = await seedTodo('linked-b');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('mode', 'select');
    fixture.componentRef.setInput('alreadyLinkedIds', new Set([a.id]));
    fixture.detectChanges();
    await FLUSH();

    expect(component.tableRecords().map(r => r['id'])).toEqual([b.id]);
    expect(component.m2mAlreadyLinkedIds()).toEqual(new Set([a.id, b.id]));
  });

  it('onQueryChange undefined 重置为空白查询', async () => {
    const { component } = await renderList();
    await FLUSH();

    component.onQueryChange(undefined);
    expect(component.pendingQuery().rules).toEqual([]);
  });

  it('M2M 确认：父实体关系 add + save；无关系属性时只 save；无父实体安全 no-op', async () => {
    await seedTodo('m2m-a');
    await seedTodo('m2m-b');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.detectChanges();
    await FLUSH();

    // 有关系属性：add + save
    const add = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const parent = { id: 'p1', save, children$: { add } };
    fixture.componentRef.setInput('parentEntity', parent as never);
    fixture.componentRef.setInput('parentRelationName', 'children');
    fixture.detectChanges();
    await FLUSH();

    component.onM2mSelectionConfirmed(component.tableRecords() as never);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0].length).toBe(2);
    await FLUSH();
    expect(save).toHaveBeenCalled();

    // 无关系属性：跳过 add，仍 save
    const saveNoRel = vi.fn().mockResolvedValue(undefined);
    const parentNoRel = { id: 'p2', save: saveNoRel };
    fixture.componentRef.setInput('parentEntity', parentNoRel as never);
    fixture.detectChanges();
    await FLUSH();
    component.onM2mSelectionConfirmed(component.tableRecords() as never);
    await FLUSH();
    expect(saveNoRel).toHaveBeenCalled();

    // 无父实体 / 无关系名：安全 no-op
    const lone = TestBed.createComponent(EntityListComponent);
    const loneComponent = lone.componentInstance;
    lone.componentRef.setInput('namespace', 'public');
    lone.componentRef.setInput('name', 'Todo');
    lone.detectChanges();
    await FLUSH();
    expect(() => loneComponent.onM2mSelectionConfirmed([])).not.toThrow();
    expect(() => loneComponent.m2mCancelSelection()).not.toThrow();
  });

  it('M2M 确认：有父实体但无关系名时跳过关系处理', async () => {
    await seedTodo('m2m-norel-a');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    const save = vi.fn().mockResolvedValue(undefined);
    const parent = { id: 'p9', save };
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('parentEntity', parent as never);
    // 不设置 parentRelationName
    fixture.detectChanges();
    await FLUSH();

    component.onM2mSelectionConfirmed(component.tableRecords() as never);
    await FLUSH();

    expect(save).not.toHaveBeenCalled();
  });

  it('M2M 确认：草稿父实体只合并本地草稿，不 save', async () => {
    await seedTodo('m2m-draft-a');
    await seedTodo('m2m-draft-b');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    const draftAdd = vi.fn();
    const draftSave = vi.fn();
    const draftParent = { id: 'p3', save: draftSave, children$: { add: draftAdd } };
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('parentEntity', draftParent as never);
    fixture.componentRef.setInput('parentRelationName', 'children');
    fixture.componentRef.setInput('draftParentEntity', draftParent as never);
    fixture.detectChanges();
    await FLUSH();

    const before = component.filteredCount();
    component.onM2mSelectionConfirmed(component.tableRecords() as never);

    expect(draftAdd).toHaveBeenCalled();
    expect(draftSave).not.toHaveBeenCalled();
    // 草稿并入本地列表：db 2 条 + 草稿 2 条
    expect(component.filteredCount()).toBe(before + 2);
  });

  it('openM2mSelectDialog：打开真实 CDK 对话框、重入被挡、取消后可重开', async () => {
    await seedTodo('m2m-dialog');
    const { fixture, component } = await renderList();
    await FLUSH();

    // 打开真实对话框（m2mSelectTpl 经 CDK Dialog 渲染）
    component.openM2mSelectDialog();
    await FLUSH();
    const dialogs = document.body.querySelectorAll('.cdk-dialog-container');
    expect(dialogs.length).toBe(1);
    expect(dialogs[0].textContent).toContain('添加Todo');

    // m2mDialogRef 已持有 → 重入被挡
    component.openM2mSelectDialog();
    await FLUSH();
    expect(document.body.querySelectorAll('.cdk-dialog-container').length).toBe(1);

    // 取消关闭对话框后允许再次打开
    component.m2mCancelSelection();
    await FLUSH();
    expect(document.body.querySelectorAll('.cdk-dialog-container').length).toBe(0);

    component.openM2mSelectDialog();
    await FLUSH();
    expect(document.body.querySelectorAll('.cdk-dialog-container').length).toBe(1);
    component.m2mCancelSelection();
    await FLUSH();
    fixture.destroy();
  });

  it('createFormFieldConfigs 直接调用返回 Todo 新建表单字段', async () => {
    const { component } = await renderList();
    await FLUSH();

    expect(component.createFormFieldConfigs().length).toBeGreaterThan(0);
  });

  it('loadMore 透传列表加载函数', async () => {
    await seedTodo('load-more');
    const { component } = await renderList();
    await FLUSH();

    const fn = (component as unknown as { loadMore(): unknown }).loadMore();
    expect(typeof fn).toBe('function');
  });

  it('view-action 打开 edit 详情对话框并加载记录数据', async () => {
    await seedTodo('dialog-me');
    const { fixture, component } = await renderList();
    await FLUSH();
    const record = component.tableRecords()[0];

    await component.onIconClicked({ name: 'view-action', record });
    await vi.waitFor(() => {
      const dialog = document.body.querySelector('.cdk-dialog-container');
      expect(dialog).toBeTruthy();
      // edit 模式：表单自带动作为「取消 / 保存」
      expect(dialog?.textContent).toContain('取消');
      expect(dialog?.textContent).toContain('保存');
    });
    // 编辑模式：表单已按记录 id 从仓库加载数据
    await vi.waitFor(() => {
      const inputs = [...document.body.querySelectorAll<HTMLInputElement>('.cdk-dialog-container input')];
      expect(inputs.some(i => i.value === 'dialog-me')).toBe(true);
    });

    // 清理：点「取消」关闭对话框，避免污染后续用例的 overlay 断言
    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>('.cdk-dialog-container button')].find(b =>
      b.textContent?.includes('取消')
    );
    cancel?.click();
    await FLUSH();
    expect(document.body.querySelector('.cdk-dialog-container')).toBeNull();
    fixture.destroy();
  });

  it('editChain 含记录 id 时 view-action 只 emit 不打开编辑对话框（防环）', async () => {
    const chained = await seedTodo('chained');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    fixture.componentRef.setInput('editChain', [chained.id]);
    const viewed: EntityTableRecord[] = [];
    component.viewEntity.subscribe(e => viewed.push(e));
    fixture.detectChanges();
    await FLUSH();
    const record = component.tableRecords()[0];

    await component.onIconClicked({ name: 'view-action', record });
    await FLUSH();

    expect(viewed).toEqual([record]);
    expect(document.body.querySelector('.cdk-dialog-container')).toBeNull();
    fixture.destroy();
  });

  it('草稿行 view-action 只 emit 不打开编辑对话框', async () => {
    await seedTodo('draft-victim');
    const fixture = TestBed.createComponent(EntityListComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'Todo');
    const draftParent = { id: 'p-draft', save: vi.fn(), children$: { add: vi.fn() } };
    fixture.componentRef.setInput('parentEntity', draftParent as never);
    fixture.componentRef.setInput('parentRelationName', 'children');
    fixture.componentRef.setInput('draftParentEntity', draftParent as never);
    const viewed: EntityTableRecord[] = [];
    component.viewEntity.subscribe(e => viewed.push(e));
    fixture.detectChanges();
    await FLUSH();
    const record = component.tableRecords()[0];

    // 行经级联通道进入本地草稿集合（未落库，无法按 id 打开编辑）
    component.onM2mSelectionConfirmed(component.tableRecords() as never);
    await FLUSH();

    await component.onIconClicked({ name: 'view-action', record });
    await FLUSH();

    expect(viewed).toEqual([record]);
    expect(document.body.querySelector('.cdk-dialog-container')).toBeNull();
    fixture.destroy();
  });
});
