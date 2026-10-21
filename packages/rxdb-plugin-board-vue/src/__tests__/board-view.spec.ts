import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    await rxdb.disconnectAll();
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
    const prompts = ['看板 A', 'C1', '任务 1'];
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
});
