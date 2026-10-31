import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardDomain, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardView from '../board-view.vue';

/** `wrapper.get()` 的返回类型（VTU 2.5 起去掉了 `exists`），辅助函数统一按它收参。 */
type ElementWrapper = Omit<DOMWrapper<Element>, 'exists'>;

/** 组件内部状态（`<script setup>` 的 setupState，经 VTU 的 vm 代理读取）。 */
interface BoardViewVm {
  readonly undoCount: number;
  readonly board: { setRestoring(value: boolean): void };
}

/**
 * BoardView 组件（看板 v2 的 Vue 半边）：真实 PGlite + 历史插件上的渲染与交互闭环，
 * 与 Angular / React 同组验收语义。真实拖拽、axe 与跨页恢复在 demo e2e。
 */
describe('BoardView（Vue 视图，看板 v2）', () => {
  let rxdb: RxDB;
  const mounted: VueWrapper[] = [];

  const mountView = (): VueWrapper => {
    const wrapper = mount(BoardView, { props: { rxdb }, attachTo: document.body });
    mounted.push(wrapper);
    return wrapper;
  };
  const $ = (wrapper: VueWrapper, testId: string): DOMWrapper<HTMLElement> => wrapper.find(`[data-testid="${testId}"]`);
  const $$ = (wrapper: VueWrapper, testId: string): DOMWrapper<HTMLElement>[] =>
    wrapper.findAll(`[data-testid="${testId}"]`);
  const texts = (wrapper: VueWrapper, testId: string): string[] => $$(wrapper, testId).map(item => item.text());
  const cardWith = (wrapper: VueWrapper, title: string) =>
    $$(wrapper, 'task-card').find(card => card.get('[data-testid="task-title"]').text() === title);
  const columnWith = (wrapper: VueWrapper, title: string) =>
    $$(wrapper, 'column').find(column => column.get('[data-testid="column-title"]').text() === title)!;
  /** 输入后按回车（setValue 派发 input + change）。 */
  const typeEnter = async (target: ElementWrapper, value: string): Promise<void> => {
    await target.setValue(value);
    await target.trigger('keydown', { key: 'Enter' });
    await flushPromises();
  };

  const mountSeeded = async (): Promise<VueWrapper> => {
    await seedReleaseBoardDataset(rxdb);
    const wrapper = mountView();
    await vi.waitFor(() => expect($$(wrapper, 'task-card')).toHaveLength(12));
    return wrapper;
  };

  beforeEach(async () => {
    vi.stubGlobal('prompt', vi.fn());
    vi.stubGlobal('confirm', vi.fn());
    rxdb = new RxDB({
      dbName: `board-view-vue-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    // 看板 v2 不再使用浏览器原生弹窗
    expect(window.prompt).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rxdb.disconnectAll();
  });

  it('空库渲染空态；种子渲染板 / 列 / 任务，标签在标签对话框里', async () => {
    const empty = mountView();
    await vi.waitFor(() => expect($(empty, 'empty-board').text()).toContain('还没有看板'));
    empty.unmount();
    mounted.splice(0);

    const wrapper = await mountSeeded();
    expect(texts(wrapper, 'column-title')).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    expect(texts(wrapper, 'column-count')).toEqual(['5', '4', '3', '0']);
    await $(wrapper, 'labels-open').trigger('click');
    expect(texts(wrapper, 'label-chip')).toEqual(['核心', '文档', '测试', '发布']);
  });

  it('新建看板 / 列 / 任务全程就地输入；建任务后输入框保持打开以便连续录入', async () => {
    const wrapper = mountView();
    await vi.waitFor(() => expect($(wrapper, 'create-board-empty').exists()).toBe(true));
    await $(wrapper, 'create-board-empty').trigger('click');
    await typeEnter(wrapper.get('[data-testid="board-composer-input"]'), '看板 A');
    await vi.waitFor(() => expect($(wrapper, 'create-column').exists()).toBe(true));
    expect($(wrapper, 'rename-board').text()).toBe('看板 A');
    expect($(wrapper, 'board-composer').exists()).toBe(false);

    await $(wrapper, 'create-column').trigger('click');
    await typeEnter(wrapper.get('[data-testid="column-composer-input"]'), 'C1');
    await vi.waitFor(() => expect($$(wrapper, 'column')).toHaveLength(1));

    await $(wrapper, 'add-task').trigger('click');
    const input = () => wrapper.get('[data-testid="add-task-input"]').element as HTMLInputElement;
    await typeEnter(wrapper.get('[data-testid="add-task-input"]'), '任务 1');
    await vi.waitFor(() => expect($$(wrapper, 'task-card')).toHaveLength(1));
    // 建任务期间输入框禁用；落库后清空并重新可输入
    await vi.waitFor(() => expect(input().disabled || input().value !== '').toBe(false));
    await typeEnter(wrapper.get('[data-testid="add-task-input"]'), '任务 2');
    await vi.waitFor(() => expect($$(wrapper, 'task-card')).toHaveLength(2));
    expect(texts(wrapper, 'task-title')).toEqual(['任务 1', '任务 2']);
  });

  it('详情即改即存：标题 / 截止日 / 标签各成一个事务，可逐次撤销', async () => {
    const wrapper = await mountSeeded();
    const vm = wrapper.vm as unknown as BoardViewVm;
    const card = () => $$(wrapper, 'task-card').find(element => element.text().includes('写发布说明'))!;
    await card().get('[data-testid="task-title"]').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'detail-panel').exists()).toBe(true));

    await typeEnter(wrapper.get('[data-testid="detail-title"]'), '写发布说明 v2');
    await vi.waitFor(() => expect(card().text()).toContain('写发布说明 v2'));
    await vi.waitFor(() => expect($(wrapper, 'detail-status').text()).toBe('已保存'));
    await wrapper.get('[data-testid="detail-due"]').setValue('2026-12-31');
    await vi.waitFor(() => expect(card().find('[data-testid="task-due"]').exists()).toBe(true));
    await vi.waitFor(() => expect(vm.undoCount).toBeGreaterThanOrEqual(2));
    await $(wrapper, 'detail-labels').trigger('click');
    const core = $$(wrapper, 'picker-option').find(option => option.text() === '核心')!;
    await core.trigger('click');
    await wrapper.get('[data-testid="popover"]').trigger('keydown', { key: 'Escape' });
    await vi.waitFor(() => expect(card().findAll('[data-testid="card-label"]')).toHaveLength(2));
    await vi.waitFor(() => expect(texts(wrapper, 'detail-label')).toEqual(['核心', '文档']));

    const history = rxdb.versionManager.history();
    await vi.waitFor(() => expect(vm.undoCount).toBeGreaterThanOrEqual(3));
    await history.undo();
    await vi.waitFor(() => expect(card().findAll('[data-testid="card-label"]')).toHaveLength(1));
    await history.undo();
    await vi.waitFor(() => expect(card().find('[data-testid="task-due"]').exists()).toBe(false));
    expect(card().text()).toContain('写发布说明 v2');
  });

  it('筛选条：标签 / 截止日组合，点击卡片标签切换，计数按结果重算', async () => {
    const wrapper = await mountSeeded();
    const filter = wrapper.get('[data-testid="board-filter-input"]');
    await filter.setValue('label:核心');
    expect($$(wrapper, 'task-card')).toHaveLength(4);
    expect(texts(wrapper, 'column-count')).toEqual(['2', '2', '0', '0']);
    expect($(wrapper, 'board-filter-count').text()).toBe('4 项');

    await filter.setValue('label:核心 due:none');
    expect($$(wrapper, 'task-card')).toHaveLength(0);
    expect(texts(wrapper, 'column-empty')).toContain('没有匹配筛选的任务');

    await $(wrapper, 'board-filter-clear').trigger('click');
    expect($$(wrapper, 'task-card')).toHaveLength(12);
    const docLabel = $$(wrapper, 'card-label').find(element => element.text() === '文档')!;
    await docLabel.trigger('click');
    expect((filter.element as HTMLInputElement).value).toBe('label:文档');
    expect($$(wrapper, 'task-card')).toHaveLength(2);
  });

  it('删除确认：取消零写；确认级联删除并给出可撤销提示', async () => {
    const wrapper = await mountSeeded();
    await columnWith(wrapper, 'Doing').get('[data-testid="column-menu-trigger"]').trigger('click');
    await $(wrapper, 'column-delete').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'confirm-delete').text()).toContain('4 个任务'));
    await $(wrapper, 'confirm-delete-no').trigger('click');
    expect($$(wrapper, 'column')).toHaveLength(4);

    await columnWith(wrapper, 'Doing').get('[data-testid="column-menu-trigger"]').trigger('click');
    await $(wrapper, 'column-delete').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'confirm-delete-yes').exists()).toBe(true));
    await $(wrapper, 'confirm-delete-yes').trigger('click');
    await vi.waitFor(() => expect($$(wrapper, 'column')).toHaveLength(3));
    expect($$(wrapper, 'task-card')).toHaveLength(8);
    await vi.waitFor(() => expect($(wrapper, 'board-toast').text()).toContain('已删除列「Doing」'));
    await $(wrapper, 'board-toast-undo').trigger('click');
    await vi.waitFor(() => expect($$(wrapper, 'column')).toHaveLength(4));
    await vi.waitFor(() => expect($$(wrapper, 'task-card')).toHaveLength(12));
  });

  it('删除清单变化后拒绝确认，不扩大用户确认的删除范围', async () => {
    const wrapper = await mountSeeded();
    const column = $$(wrapper, 'column')[0];
    await column.get('[data-testid="column-menu-trigger"]').trigger('click');
    await $(wrapper, 'column-delete').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'confirm-delete').exists()).toBe(true));
    const selector = wrapper.get('[data-testid="board-selector"]').element as HTMLSelectElement;
    const domain = new BoardDomain(rxdb, () => ({ boardId: selector.value as Board['id'], restoring: false }));
    await domain.createTask({ columnId: column.attributes('data-column-id') as Column['id'], title: '后来新增的任务' });
    await $(wrapper, 'confirm-delete-yes').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'board-notice').text()).toContain('重新确认'));
    expect($$(wrapper, 'column')).toHaveLength(4);
    await vi.waitFor(() => expect($$(wrapper, 'task-card')).toHaveLength(13));
  });

  it('删除最后一块板后仍能在空态撤销并恢复板', async () => {
    const domain = new BoardDomain(rxdb, () => ({ boardId: null, restoring: false }));
    await domain.createBoard({ title: '唯一板' });
    const wrapper = mountView();
    await vi.waitFor(() => expect($(wrapper, 'rename-board').text()).toBe('唯一板'));
    await $(wrapper, 'board-menu-trigger').trigger('click');
    await $(wrapper, 'delete-board').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'confirm-delete-yes').exists()).toBe(true));
    await $(wrapper, 'confirm-delete-yes').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'empty-board').exists()).toBe(true));
    expect($(wrapper, 'undo').attributes('disabled')).toBeUndefined();
    await $(wrapper, 'undo').trigger('click');
    await vi.waitFor(() => expect($(wrapper, 'rename-board').text()).toBe('唯一板'));
  });

  it('Alt + 方向键移动卡片并持久化，焦点跟随卡片', async () => {
    // happy-dom 的 rAF 走 setImmediate，「守住焦点约 60 帧」会在活查询回流前瞬间耗尽；按 16ms 一帧模拟真实帧率
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16)
    );
    const wrapper = await mountSeeded();
    const card = cardWith(wrapper, '写发布说明')!.element;
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(texts(wrapper, 'task-title')[0]).toBe('写发布说明'));
    const tasks = await firstValueFrom(
      rxdb.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [] } })
    );
    const todo = columnWith(wrapper, 'To do').attributes('data-column-id');
    expect(tasks.filter(task => task.columnId === todo).map(task => task.title)[0]).toBe('写发布说明');
    await vi.waitFor(() => expect(document.activeElement).toBe(cardWith(wrapper, '写发布说明')!.element));
  });

  it('恢复中写入口禁用、浏览可用', async () => {
    const wrapper = await mountSeeded();
    (wrapper.vm as unknown as BoardViewVm).board.setRestoring(true);
    await vi.waitFor(() => expect($(wrapper, 'restoring-note').exists()).toBe(true));
    for (const testId of ['create-board', 'create-column', 'add-task', 'undo']) {
      expect($(wrapper, testId).attributes('disabled'), testId).toBeDefined();
    }
    expect($(wrapper, 'labels-open').attributes('disabled')).toBeUndefined();
    await $(wrapper, 'labels-open').trigger('click');
    expect($$(wrapper, 'label-chip')).toHaveLength(4);
  });
});
