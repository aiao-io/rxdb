import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardDomain, BoardLabel, Column, matchAll, readFirst, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardView } from '../board-view.js';
import { LAST_BOARD_KEY, useBoard } from '../use-board.js';

describe('看板行为回归', () => {
  let db: RxDB;
  beforeEach(async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => memory.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        memory.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        memory.delete(key);
      })
    });
    window.confirm = vi.fn(() => false);
    memory.clear();
    db = new RxDB({
      dbName: `board-regressions-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    db.use(rxDBPluginHistory);
    db.adapter('pglite', rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    await db.connect('pglite');
    await seedReleaseBoardDataset(db);
  });
  const memory = new Map<string, string>();
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await db.disconnectAll();
  });
  const show = async () => {
    render(<BoardView rxdb={db} />);
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(12));
  };

  it('删除确认拒绝后来新增的任务', async () => {
    await show();
    fireEvent.click(screen.getAllByTestId('column-delete')[0]);
    expect((await screen.findByTestId('confirm-delete')).textContent).toContain('5 个任务');
    const board = (await readFirst(db.entityManager.getRepository(Board).find({ where: matchAll() }))).find(b =>
      b.title.includes('1.0')
    )!;
    const column = (await readFirst(db.entityManager.getRepository(Column).find({ where: matchAll() }))).find(
      c => c.boardId === board.id && c.title === 'To do'
    )!;
    await act(async () => {
      await new BoardDomain(db, () => ({ boardId: board.id, restoring: false })).createTask({
        columnId: column.id,
        title: 'added after confirmation'
      });
    });
    await waitFor(() => expect(screen.getAllByTestId('task-card')).toHaveLength(13));
    fireEvent.click(screen.getByTestId('confirm-delete-yes'));
    await waitFor(() =>
      expect(screen.queryAllByTestId('column').length === 3 || screen.queryByTestId('board-notice') !== null).toBe(true)
    );
    expect(await readFirst(db.entityManager.getRepository(Task).find({ where: matchAll() }))).toHaveLength(21);
  });

  it('板选择持久化到浏览器存储', async () => {
    const hook = renderHook(() => useBoard(db));
    await waitFor(() => expect(hook.result.current.boards).toHaveLength(2));
    const second = hook.result.current.boards[1];
    act(() => hook.result.current.selectBoard(second.id));
    expect(localStorage.getItem(LAST_BOARD_KEY)).toBe(second.id);
    hook.unmount();
    const reopened = renderHook(() => useBoard(db));
    await waitFor(() => expect(reopened.result.current.currentBoardId).toBe(second.id));
  });

  it('菜单移动严格位于所选任务之后', async () => {
    await show();
    const column = screen.getAllByTestId('column')[0];
    const original = within(column)
      .getAllByTestId('task-title')
      .map(e => e.textContent);
    fireEvent.click(within(column).getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    const position = within(screen.getByTestId('move-position')).getByRole('option', {
      name: `在「${original[1]}」之后`
    }) as HTMLOptionElement;
    fireEvent.change(screen.getByTestId('move-position'), { target: { value: position.value } });
    fireEvent.click(screen.getByTestId('move-task'));
    await waitFor(() => expect(within(column).getAllByTestId('task-title')[0].textContent).toBe(original[1]));
    expect(
      within(column)
        .getAllByTestId('task-title')
        .map(e => e.textContent)
    ).toEqual([original[1], original[0], ...original.slice(2)]);
  });

  it('菜单移动可以进入空列', async () => {
    await show();
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    const target = (screen.getByTestId('move-column') as HTMLSelectElement).options[3].value;
    fireEvent.change(screen.getByTestId('move-column'), { target: { value: target } });
    fireEvent.click(screen.getByTestId('move-task'));
    await waitFor(() =>
      expect(within(screen.getAllByTestId('column')[3]).queryAllByTestId('task-title')).toHaveLength(1)
    );
  });

  it('拒绝放弃草稿时保持当前任务', async () => {
    await show();
    const titles = screen.getAllByTestId('task-title');
    fireEvent.click(titles[0]);
    await screen.findByTestId('detail-panel');
    const original = (screen.getByTestId('detail-title') as HTMLInputElement).value;
    fireEvent.change(screen.getByTestId('detail-description'), { target: { value: 'unsaved draft' } });
    const confirm = vi.mocked(window.confirm);
    fireEvent.click(titles[1]);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe(original);
  });

  it('自己的菜单跨列移动允许继续保存草稿', async () => {
    await show();
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: 'edited then moved' } });
    const target = (screen.getByTestId('move-column') as HTMLSelectElement).options[1].value;
    fireEvent.change(screen.getByTestId('move-column'), { target: { value: target } });
    fireEvent.click(screen.getByTestId('move-task'));
    await waitFor(() =>
      expect(within(screen.getAllByTestId('column')[1]).getAllByTestId('task-title')).toHaveLength(5)
    );
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
    expect(screen.getAllByTestId('task-title').map(e => e.textContent)).toContain('edited then moved');
  });

  it('自己的拖拽跨列移动保留详情草稿并允许保存', async () => {
    await show();
    const movedId = screen.getAllByTestId('task-card')[0].getAttribute('data-task-id')!;
    const columns = screen.getAllByTestId('column');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const index = Math.max(columns.indexOf(this), 0);
      return {
        left: index * 100,
        right: (index + 1) * 100,
        top: 0,
        bottom: 500,
        x: index * 100,
        y: 0,
        width: 100,
        height: 500,
        toJSON: () => ({})
      };
    });
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '拖拽后保存的草稿' } });
    const drop = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 350, clientY: 50 });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { getData: (key: string) => (key === 'application/x-board-task' ? movedId : '') }
    });
    fireEvent(columns[3], drop);
    await waitFor(() => expect(within(columns[3]).getAllByTestId('task-title')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => expect(screen.queryByTestId('detail-panel')).toBeNull());
    expect(screen.getAllByTestId('task-title').map(element => element.textContent)).toContain('拖拽后保存的草稿');
  });

  it('自己的跨列移动仍复核其他入口的字段修改', async () => {
    await show();
    fireEvent.click(screen.getAllByTestId('task-title')[0]);
    await screen.findByTestId('detail-panel');
    fireEvent.change(screen.getByTestId('detail-title'), { target: { value: '本地草稿' } });
    const board = (await readFirst(db.entityManager.getRepository(Board).find({ where: matchAll() }))).find(item =>
      item.title.includes('1.0')
    )!;
    const taskId = screen.getAllByTestId('task-card')[0].getAttribute('data-task-id')!;
    await act(async () => {
      await new BoardDomain(db, () => ({ boardId: board.id, restoring: false })).updateTaskTitle(
        taskId as Task['id'],
        '另一入口标题'
      );
    });
    const target = (screen.getByTestId('move-column') as HTMLSelectElement).options[1].value;
    fireEvent.change(screen.getByTestId('move-column'), { target: { value: target } });
    fireEvent.click(screen.getByTestId('move-task'));
    await waitFor(() =>
      expect(within(screen.getAllByTestId('column')[1]).getAllByTestId('task-title')).toHaveLength(5)
    );
    fireEvent.click(screen.getByTestId('detail-save'));
    await waitFor(() => expect(screen.getByTestId('board-notice').textContent).toContain('其它入口修改'));
    expect((screen.getByTestId('detail-title') as HTMLInputElement).value).toBe('本地草稿');
    expect(screen.getAllByTestId('task-title').map(element => element.textContent)).toContain('另一入口标题');
  });

  it('恢复中拒绝撤销与重做', async () => {
    const hook = renderHook(() => useBoard(db));
    await waitFor(() => expect(hook.result.current.undoCount).toBeGreaterThan(0));
    act(() => hook.result.current.setRestoring(true));
    await expect(hook.result.current.actions.undo()).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(hook.result.current.actions.redo()).rejects.toMatchObject({ code: 'restore_in_progress' });
  });
});
