import { RxDB, type EntityType } from '@aiao/rxdb';
import type { EntityTableRecord } from '@aiao/rxdb-model';
import { Todo } from '@aiao/rxdb-test/entities';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryTableComponent } from '../entity-table/query-table/query-table.component';
import { FakeListTable } from '../testing/fake-vtable';
import { createInMemoryRxdb, IN_MEMORY_ADAPTER_NAME, InMemoryRxDBAdapter } from '../testing/in-memory-rxdb';
import { EntityListComponent } from './entity-list.component';

// VTable 引擎打桩（列表经 query-table → entity-table 渲染真实组件链，只替换渲染引擎）
vi.mock('@visactor/vtable', () => import('../testing/fake-vtable'));
vi.mock('@visactor/vtable-editors', () => import('../testing/fake-vtable-editors'));

const FLUSH = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * EntityListComponent —— **真实组件源码**（specs/027 T025a）。
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
        postMessage(_message: unknown): void {
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
    adapter = (await firstValueFrom(rxdb.localAdapter$)) as InMemoryRxDBAdapter;
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
    const confirmed: Array<Todo[]> = [];
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
  function tableOf(fixture: {
    debugElement: { query: (p: unknown) => { componentInstance: QueryTableComponent } | null };
  }): FakeListTable {
    const queryTable = fixture.debugElement.query(By.directive(QueryTableComponent));
    return queryTable.componentInstance.tableInstance as FakeListTable;
  }

  const repoOf = () => rxdb.entityManager.getRepository(Todo as unknown as EntityType);
  const findTitles = () =>
    new Promise<string[]>((resolve, reject) => {
      repoOf()
        .find({ where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'title', sort: 'asc' }] } as never)
        .subscribe({ next: rows => resolve(rows.map(r => (r as unknown as { title: string }).title)), error: reject });
    });

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
      field: 'title',
      type: 'string',
      value: 'changed',
      previousValue: 'undo-me',
      record: component.tableRecords()[0]
    });
    await FLUSH();
    expect(component.undoCount()).toBe(before + 1);
    expect(component.canUndo()).toBe(true);

    component.undo();
    await FLUSH();
    expect(component.tableRecords().map(r => r['title'])).toContain('undo-me');
    expect(component.canRedo()).toBe(true);

    component.redo();
    await FLUSH();
    expect(component.tableRecords().map(r => r['title'])).toContain('changed');
  });

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

  it('选择模式：勾选后 selectionConfirmed 输出真实实体实例', async () => {
    const a = await seedTodo('select-a');
    await seedTodo('select-b');

    const { component, confirmed } = await renderList({ mode: 'select' });
    await FLUSH();

    // 选择模式首列是 __selected checkbox
    const columns = component.tableColumns() as Array<{ field?: string }>;
    expect(columns[0].field).toBe('__selected');

    component.onCellChanged({ field: '__selected', type: 'boolean', value: true, record: { id: a.id } });
    component.onCellChanged({ field: '__selected', type: 'boolean', value: false, record: { id: 'nobody' } });

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
});
