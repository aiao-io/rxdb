import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardDomain, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardView from '../board-view.vue';

/**
 * BoardView 组件（US-539 阶段 A 的 Vue 半边）：与 Angular / React 同组验收语义。
 * 真实拖拽与 a11y 在 demo e2e。
 */
describe('BoardView（Vue 视图）', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rxdb.disconnectAll();
  });

  it('删除最后一块板后仍能在空态撤销并恢复板', async () => {
    const domain = new BoardDomain(rxdb, () => ({ boardId: null, restoring: false }));
    await domain.createBoard({ title: '唯一板' });
    const fixture = mount(BoardView, { props: { rxdb } });
    try {
      await vi.waitFor(() => expect(fixture.get('[data-testid="rename-board"]').text()).toBe('唯一板'));
      await fixture.get('[data-testid="delete-board"]').trigger('click');
      await vi.waitFor(() => expect(fixture.find('[data-testid="confirm-delete-yes"]').exists()).toBe(true));
      await fixture.get('[data-testid="confirm-delete-yes"]').trigger('click');
      await vi.waitFor(() => expect(fixture.find('[data-testid="empty-board"]').exists()).toBe(true));
      expect(fixture.get('[data-testid="undo"]').attributes('disabled')).toBeUndefined();
      await fixture.get('[data-testid="undo"]').trigger('click');
      await vi.waitFor(() => expect(fixture.get('[data-testid="rename-board"]').text()).toBe('唯一板'));
    } finally {
      fixture.unmount();
    }
  });

  it('空库渲染空态；种子渲染板/列/任务/标签', async () => {
    const empty = mount(BoardView, { props: { rxdb } });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(empty.find('[data-testid="empty-board"]').exists()).toBe(true);
    empty.unmount();

    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(fixture.findAll('[data-testid="column"]')).toHaveLength(4);
    expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(12);
    expect(fixture.findAll('[data-testid="label-chip"]')).toHaveLength(4);
    expect(fixture.findAll('[data-testid="column-title"]').map(el => el.text().trim())).toEqual([
      'To do',
      'Doing',
      'Done',
      'Ideas'
    ]);
    fixture.unmount();
  });

  it('创建板/列/任务后渲染更新', async () => {
    const fixture = mount(BoardView, { props: { rxdb } });
    await new Promise(resolve => setTimeout(resolve, 200));
    const prompts = ['看板 A', 'C1'];
    const originalPrompt = window.prompt;
    window.prompt = () => prompts.shift() ?? null;
    try {
      await fixture.find('[data-testid="create-board-empty"]');
      await fixture.get('[data-testid="create-board-empty"]').trigger('click');
      await new Promise(resolve => setTimeout(resolve, 500));
      await fixture.get('[data-testid="create-column"]').trigger('click');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(fixture.findAll('[data-testid="column"]')).toHaveLength(1);
      await fixture.get('[data-testid="add-task"]').trigger('click');
      await fixture.get('[data-testid="add-task-input"]').setValue('任务 1');
      await fixture.get('[data-testid="add-task-input"]').trigger('keydown.enter');
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(1);
      expect(fixture.get('[data-testid="task-title"]').text()).toBe('任务 1');
    } finally {
      window.prompt = originalPrompt;
    }
    fixture.unmount();
  });

  it('删除确认：取消零写、确认级联', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(fixture.findAll('[data-testid="column"]')).toHaveLength(4);

    await fixture.findAll('[data-testid="column-delete"]')[0].trigger('click');
    await new Promise(resolve => setTimeout(resolve, 200));
    await fixture.get('[data-testid="confirm-delete-no"]').trigger('click');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(fixture.findAll('[data-testid="column"]')).toHaveLength(4);

    await fixture.findAll('[data-testid="column-delete"]')[0].trigger('click');
    await new Promise(resolve => setTimeout(resolve, 200));
    await fixture.get('[data-testid="confirm-delete-yes"]').trigger('click');
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(fixture.findAll('[data-testid="column"]')).toHaveLength(3);
    expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(7);
    fixture.unmount();
  });

  it('删除清单变化后拒绝确认，不扩大用户确认的删除范围', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await vi.waitFor(() => expect(fixture.findAll('[data-testid="column"]')).toHaveLength(4));
    const column = fixture.findAll('[data-testid="column"]')[0];
    await column.get('[data-testid="column-delete"]').trigger('click');
    await vi.waitFor(() => expect(fixture.find('[data-testid="confirm-delete"]').exists()).toBe(true));
    const boardId = fixture.get('[data-testid="board-selector"]').element as HTMLSelectElement;
    const domain = new BoardDomain(rxdb, () => ({ boardId: boardId.value as Board['id'], restoring: false }));
    await domain.createTask({ columnId: column.attributes('data-column-id') as Column['id'], title: '后来新增的任务' });
    await fixture.get('[data-testid="confirm-delete-yes"]').trigger('click');
    await vi.waitFor(() => expect(fixture.get('[data-testid="board-notice"]').text()).toContain('重新确认'));
    expect(fixture.findAll('[data-testid="column"]')).toHaveLength(4);
    expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(13);
    fixture.unmount();
  });

  it('切换任务先确认未保存草稿，取消保留编辑内容', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await vi.waitFor(() => expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(12));
    await fixture.findAll('[data-testid="task-title"]')[0].trigger('click');
    await vi.waitFor(() => expect(fixture.find('[data-testid="detail-title"]').exists()).toBe(true));
    await fixture.get('[data-testid="detail-title"]').setValue('未保存草稿');
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    await fixture.findAll('[data-testid="task-title"]')[1].trigger('click');
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(confirm).toHaveBeenCalledOnce();
    expect((fixture.get('[data-testid="detail-title"]').element as HTMLInputElement).value).toBe('未保存草稿');
    fixture.unmount();
  });

  it('同列位置选项排除自身，跨列后仍可保存原草稿', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await vi.waitFor(() => expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(12));
    const first = fixture.findAll('[data-testid="task-card"]')[0];
    const originalTitle = first.get('[data-testid="task-title"]').text();
    await first.get('[data-testid="task-title"]').trigger('click');
    await vi.waitFor(() => expect(fixture.find('[data-testid="detail-title"]').exists()).toBe(true));
    expect(fixture.get('[data-testid="move-position"]').text()).not.toContain(`在「${originalTitle}」之后`);
    await fixture.get('[data-testid="move-position"]').setValue('1');
    await fixture.get('[data-testid="move-task"]').trigger('click');
    await vi.waitFor(() =>
      expect(fixture.findAll('[data-testid="column"]')[0].findAll('[data-testid="task-title"]')[1].text()).toBe(
        originalTitle
      )
    );
    await fixture.get('[data-testid="detail-title"]').setValue('移动后保存草稿');
    const targetColumn = fixture.findAll('[data-testid="column"]')[1].attributes('data-column-id');
    await fixture.get('[data-testid="move-column"]').setValue(targetColumn);
    await fixture.get('[data-testid="move-task"]').trigger('click');
    await vi.waitFor(() => expect(fixture.findAll('[data-testid="column"]')[1].text()).toContain(originalTitle));
    await fixture.get('[data-testid="detail-save"]').trigger('click');
    await vi.waitFor(() => expect(fixture.find('[data-testid="detail-panel"]').exists()).toBe(false));
    expect(fixture.text()).toContain('移动后保存草稿');
    fixture.unmount();
  });

  it('跨列移动不刷新其它快照字段，真实并发编辑仍拒绝保存', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = mount(BoardView, { props: { rxdb } });
    await vi.waitFor(() => expect(fixture.findAll('[data-testid="task-card"]')).toHaveLength(12));
    const first = fixture.findAll('[data-testid="task-card"]')[0];
    const taskId = first.attributes('data-task-id') as Task['id'];
    await first.get('[data-testid="task-title"]').trigger('click');
    await vi.waitFor(() => expect(fixture.find('[data-testid="detail-title"]').exists()).toBe(true));
    await fixture.get('[data-testid="detail-title"]').setValue('我的草稿');
    const selector = fixture.get('[data-testid="board-selector"]').element as HTMLSelectElement;
    const domain = new BoardDomain(rxdb, () => ({ boardId: selector.value as Board['id'], restoring: false }));
    await domain.updateTaskTitle(taskId, '来自另一入口的标题');
    const target = fixture.findAll('[data-testid="column"]')[1];
    await fixture.get('[data-testid="move-column"]').setValue(target.attributes('data-column-id'));
    await fixture.get('[data-testid="move-task"]').trigger('click');
    await vi.waitFor(() => expect(target.text()).toContain('来自另一入口的标题'));
    await fixture.get('[data-testid="detail-save"]').trigger('click');
    await vi.waitFor(() => expect(fixture.get('[data-testid="board-notice"]').text()).toContain('其它入口修改'));
    expect((fixture.get('[data-testid="detail-title"]').element as HTMLInputElement).value).toBe('我的草稿');
    expect(target.text()).toContain('来自另一入口的标题');
    fixture.unmount();
  });
});
