import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardView } from '../board-view.js';

/**
 * BoardView 组件（US-539 阶段 A 的 React 半边）：与 Angular 同组验收语义。
 * 真实拖拽与 a11y 在 demo e2e。
 */
describe('BoardView（React 视图）', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-view-react-${Math.random().toString(36).slice(2)}`,
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
    const empty = render(<BoardView rxdb={rxdb} />);
    expect(await screen.findByTestId('empty-board')).toBeTruthy();
    empty.unmount();

    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(4));
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));
    expect(screen.getAllByTestId('label-chip')).toHaveLength(4);
    expect(screen.getAllByTestId('column-title').map(el => el.textContent)).toEqual([
      'To do',
      'Doing',
      'Done',
      'Ideas'
    ]);
    fixture.unmount();
  });

  it('创建板/列/任务后渲染更新', async () => {
    const fixture = render(<BoardView rxdb={rxdb} />);
    await screen.findByTestId('empty-board');
    const prompts = ['看板 A', 'C1', '任务 1'];
    const originalPrompt = window.prompt;
    window.prompt = () => prompts.shift() ?? null;
    try {
      screen.getByTestId('create-board-empty').click();
      await new Promise(resolve => setTimeout(resolve, 500));
      screen.getByTestId('create-column').click();
      await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(1));
      screen.getByTestId('add-task').click();
      await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(1));
      expect(screen.getByTestId('task-title').textContent).toBe('任务 1');
    } finally {
      window.prompt = originalPrompt;
    }
    fixture.unmount();
  });

  it('删除确认：取消零写、确认级联', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(4));

    screen.getAllByTestId('column-delete')[0].click();
    await screen.findByTestId('confirm-delete');
    screen.getByTestId('confirm-delete-no').click();
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(4));

    screen.getAllByTestId('column-delete')[0].click();
    await screen.findByTestId('confirm-delete');
    screen.getByTestId('confirm-delete-yes').click();
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(3));
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(7));
    fixture.unmount();
  });

  it('内联编辑空标题零写并提示', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));

    screen.getAllByTestId('task-edit-title')[0].click();
    const editor = await screen.findByTestId('task-title-editor');
    fireEvent.change(editor, { target: { value: '   ' } });
    screen.getByTestId('task-title-save').click();
    await screen.findByTestId('board-notice');
    fixture.unmount();
  });
});
