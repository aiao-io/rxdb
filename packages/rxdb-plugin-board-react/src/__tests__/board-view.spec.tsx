import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardDomain, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    rxdb.use(rxDBPluginSearch);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    await rxdb.disconnectAll();
  });

  it('删除最后一块板后仍能在空态撤销并恢复板', async () => {
    const domain = new BoardDomain(rxdb, () => ({ boardId: null, restoring: false }));
    await domain.createBoard({ title: '唯一板' });
    const fixture = render(<BoardView rxdb={rxdb} />);
    try {
      await waitFor(() => expect(screen.getByTestId('rename-board').textContent).toBe('唯一板'));
      fireEvent.click(screen.getByTestId('delete-board'));
      fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
      await screen.findByTestId('empty-board');
      expect(screen.getByTestId('undo').hasAttribute('disabled')).toBe(false);
      fireEvent.click(screen.getByTestId('undo'));
      await waitFor(() => expect(screen.getByTestId('rename-board').textContent).toBe('唯一板'));
    } finally {
      fixture.unmount();
    }
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

  it('筛选栏按标签和截止日缩小视图，并支持隐藏空列', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));

    fireEvent.click(screen.getByTestId('board-filter-toggle'));
    const labelFilter = screen.getByTestId('board-filter-label') as HTMLSelectElement;
    const coreOption = [...labelFilter.options].find(option => option.textContent === '核心');
    expect(coreOption).toBeTruthy();
    fireEvent.change(labelFilter, { target: { value: coreOption?.value } });
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(4));

    fireEvent.change(screen.getByTestId('board-filter-due'), { target: { value: 'overdue' } });
    await waitFor(() => expect(screen.queryAllByTestId('task-card')).toHaveLength(0));
    fireEvent.click(screen.getByTestId('toggle-empty-columns'));
    await waitFor(() => expect(screen.queryAllByTestId('column')).toHaveLength(0));

    fireEvent.click(screen.getByTestId('clear-board-filters'));
    fireEvent.click(screen.getByTestId('toggle-empty-columns'));
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));
    fixture.unmount();
  });

  it('按 / 聚焦搜索，按 Escape 清除搜索', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getByTestId('board-search-input')).toBeTruthy());
    const search = screen.getByTestId('board-search-input');

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: '同步' } });
    expect((search as HTMLInputElement).value).toBe('同步');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect((search as HTMLInputElement).value).toBe(''));
    fixture.unmount();
  });

  it('创建板/列/任务后渲染更新', async () => {
    const fixture = render(<BoardView rxdb={rxdb} />);
    await screen.findByTestId('empty-board');
    const prompts = ['看板 A', 'C1'];
    const originalPrompt = window.prompt;
    window.prompt = () => prompts.shift() ?? null;
    try {
      await act(async () => {
        fireEvent.click(screen.getByTestId('create-board-empty'));
        await new Promise(resolve => setTimeout(resolve, 500));
      });
      fireEvent.click(screen.getByTestId('create-column'));
      await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(1));
      fireEvent.click(screen.getByTestId('add-task'));
      // 点击后表单渲染有异步竞态（React 并发渲染 + 建列写入链），等表单出现再填
      await waitFor(() => expect(screen.getByTestId('add-task-input')).toBeTruthy());
      fireEvent.change(screen.getByTestId('add-task-input'), { target: { value: '任务 1' } });
      fireEvent.keyDown(screen.getByTestId('add-task-input'), { key: 'Enter' });
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

    fireEvent.click(screen.getAllByTestId('column-delete')[0]);
    await screen.findByTestId('confirm-delete');
    fireEvent.click(screen.getByTestId('confirm-delete-no'));
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(4));

    fireEvent.click(screen.getAllByTestId('column-delete')[0]);
    await screen.findByTestId('confirm-delete');
    fireEvent.click(screen.getByTestId('confirm-delete-yes'));
    await waitFor(() => expect(screen.getAllByTestId('column')).toHaveLength(3));
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(7));
    fixture.unmount();
  });

  it('内联编辑空标题零写并提示', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));

    fireEvent.click(screen.getAllByTestId('task-edit-title')[0]);
    const editor = await screen.findByTestId('task-title-editor');
    fireEvent.change(editor, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('task-title-save'));
    await screen.findByTestId('board-notice');
    fixture.unmount();
  });
});
