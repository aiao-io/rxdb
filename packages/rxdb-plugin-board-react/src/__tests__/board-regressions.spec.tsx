import type { RxDB } from '@aiao/rxdb';
import { BoardDomain, matchAll, readFirst, Task } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardView } from '../board-view.js';
import { LAST_BOARD_KEY, useBoard, type UseBoardReturn } from '../use-board.js';
import {
  allByTestId,
  byTestId,
  cardByTitle,
  columnByTitle,
  connectBoardDb,
  dragAt,
  inputValue,
  memoryStorage,
  rectOf,
  texts,
  titlesIn,
  typeInto,
  within
} from './board-test-utils.js';

const SEED_LAYOUT = '5,4,3,0';
const layoutOf = (board: UseBoardReturn): string =>
  board.columns.map(column => board.tasks.filter(task => task.columnId === column.id).length).join(',');

/** 看板行为回归（看板 v2 契约，真实 PGlite + 历史插件）。 */
describe('看板行为回归', () => {
  let db: RxDB;

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    db = await connectBoardDb('board-regressions');
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await db.disconnectAll();
  });

  describe('演示数据装载（React 宿主「装载演示数据」流程）', () => {
    it.each([
      ['普通挂载', false],
      ['StrictMode 双挂载', true]
    ])('空库挂载后装载种子：活查询收敛到种子全集（%s）', async (_label, strict) => {
      const wrapper =
        strict ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> : undefined;
      const hook = renderHook(() => useBoard(db), { wrapper });
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      await act(async () => {
        await seedReleaseBoardDataset(db);
      });
      await waitFor(() => expect(layoutOf(hook.result.current)).toBe(SEED_LAYOUT), { timeout: 5000 });
      expect(hook.result.current.tasks).toHaveLength(12);
      hook.unmount();
    });

    it('同会话改过再删光再装载：固定 ID 与旧审计时间戳不残留旧实例', async () => {
      const hook = renderHook(() => useBoard(db));
      const board = () => hook.result.current;
      await act(async () => {
        await seedReleaseBoardDataset(db);
      });
      await waitFor(() => expect(board().tasks).toHaveLength(12), { timeout: 5000 });
      const [todo, doing] = board().columns;
      const fix = board().tasks.find(task => task.title === '修复登录 bug')!;
      const release = board().tasks.find(task => task.title === '写发布说明')!;
      await act(async () => {
        await board().actions.moveTask(fix.id, { kind: 'end', columnId: board().columns[3].id });
        await board().actions.updateTaskTitle(release.id, '写发布说明 改');
      });
      await waitFor(() => expect(board().tasks.find(task => task.title === '写发布说明 改')).toBeTruthy());
      for (let remaining = board().boards.length; remaining > 0; remaining--) {
        await waitFor(() => expect(board().currentBoardId).not.toBeNull());
        await act(async () => {
          await board().actions.executeDelete(await board().actions.planBoardDelete(board().currentBoardId!));
        });
        await waitFor(() => expect(board().boards).toHaveLength(remaining - 1), { timeout: 5000 });
      }
      await act(async () => {
        await seedReleaseBoardDataset(db);
      });
      await waitFor(() => expect(layoutOf(board())).toBe(SEED_LAYOUT), { timeout: 5000 });
      expect(board().tasks.find(task => task.id === fix.id)?.columnId).toBe(todo.id);
      expect(board().tasks.find(task => task.id === release.id)?.title).toBe('写发布说明');
      expect(board().columns[1].id).toBe(doing.id);
      hook.unmount();
    });
  });

  describe('板选择与门禁', () => {
    it('板选择持久化到浏览器存储，重开回到上次的板', async () => {
      await seedReleaseBoardDataset(db);
      const hook = renderHook(() => useBoard(db));
      await waitFor(() => expect(hook.result.current.boards).toHaveLength(2));
      const second = hook.result.current.boards[1];
      act(() => hook.result.current.selectBoard(second.id));
      expect(localStorage.getItem(LAST_BOARD_KEY)).toBe(second.id);
      hook.unmount();
      const reopened = renderHook(() => useBoard(db));
      await waitFor(() => expect(reopened.result.current.currentBoardId).toBe(second.id));
      reopened.unmount();
    });

    it('恢复中拒绝撤销与重做', async () => {
      const hook = renderHook(() => useBoard(db));
      await act(async () => {
        await seedReleaseBoardDataset(db);
      });
      await waitFor(() => expect(hook.result.current.undoCount).toBeGreaterThan(0));
      act(() => hook.result.current.setRestoring(true));
      await expect(hook.result.current.actions.undo()).rejects.toMatchObject({ code: 'restore_in_progress' });
      await expect(hook.result.current.actions.redo()).rejects.toMatchObject({ code: 'restore_in_progress' });
      hook.unmount();
    });
  });

  describe('移动与即改即存', () => {
    const show = async (): Promise<void> => {
      await seedReleaseBoardDataset(db);
      render(<BoardView rxdb={db} />);
      await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12), { timeout: 5000 });
    };
    const persistedTitles = async (columnTitle: string): Promise<string[]> => {
      const tasks = await readFirst(db.entityManager.getRepository(Task).find({ where: matchAll() }));
      const columnId = columnByTitle(columnTitle).getAttribute('data-column-id');
      return tasks.filter(task => task.columnId === columnId).map(task => task.title);
    };

    it('Alt + ↓ 严格移到下一张之后并持久化', async () => {
      await show();
      const original = titlesIn(columnByTitle('To do'));
      fireEvent.keyDown(cardByTitle(original[0]), { key: 'ArrowDown', altKey: true });
      await waitFor(() =>
        expect(titlesIn(columnByTitle('To do'))).toEqual([original[1], original[0], ...original.slice(2)])
      );
      expect((await persistedTitles('To do')).slice(0, 2)).toEqual([original[1], original[0]]);
    });

    it('「移到列…」可以进入空列（追加到末尾）', async () => {
      await show();
      const card = cardByTitle('修复登录 bug');
      fireEvent.click(within(card, 'task-menu-trigger'));
      fireEvent.click(byTestId('task-move-to-column'));
      fireEvent.click(allByTestId('picker-option').find(option => option.textContent?.includes('Ideas'))!);
      await waitFor(() => expect(titlesIn(columnByTitle('Ideas'))).toEqual(['修复登录 bug']));
      expect(await persistedTitles('Ideas')).toEqual(['修复登录 bug']);
    });

    it('详情「所在列」移动后继续即改即存，不被自己的移动误判冲突', async () => {
      await show();
      fireEvent.click(within(cardByTitle('修复登录 bug'), 'task-title'));
      await waitFor(() => expect(inputValue('detail-title')).toBe('修复登录 bug'));
      fireEvent.click(byTestId('detail-column'));
      fireEvent.click(allByTestId('picker-option').find(option => option.textContent?.includes('Doing'))!);
      await waitFor(() => expect(titlesIn(columnByTitle('Doing'))).toContain('修复登录 bug'));
      await waitFor(() => expect(byTestId('detail-column').textContent).toContain('Doing'));
      typeInto(byTestId('detail-title'), '移动后改名', 'Enter');
      await waitFor(() => expect(titlesIn(columnByTitle('Doing'))).toContain('移动后改名'));
      await waitFor(() => expect(texts('detail-status')).toEqual(['已保存']));
      expect(screen.queryByTestId('board-notice')).toBeNull();
    });

    it('拖拽跨列后详情继续即改即存', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return rectOf(this);
      });
      await show();
      const card = cardByTitle('修复登录 bug');
      fireEvent.click(within(card, 'task-title'));
      await waitFor(() => expect(inputValue('detail-title')).toBe('修复登录 bug'));
      fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
      dragAt(columnByTitle('Ideas'), 'drop', 650, 100, { getData: () => '' });
      await waitFor(() => expect(titlesIn(columnByTitle('Ideas'))).toEqual(['修复登录 bug']));
      await waitFor(() => expect(byTestId('detail-column').textContent).toContain('Ideas'));
      typeInto(byTestId('detail-title'), '拖拽后改名', 'Enter');
      await waitFor(() => expect(titlesIn(columnByTitle('Ideas'))).toEqual(['拖拽后改名']));
      expect(screen.queryByTestId('board-notice')).toBeNull();
    });

    it('跨列移动仍复核其他入口对同一字段的修改：拒绝并保留草稿', async () => {
      await show();
      const card = cardByTitle('修复登录 bug');
      const taskId = card.getAttribute('data-task-id') as Task['id'];
      fireEvent.click(within(card, 'task-title'));
      await waitFor(() => expect(inputValue('detail-title')).toBe('修复登录 bug'));
      const boardId = (byTestId('board-selector') as HTMLSelectElement).value as Task['id'];
      await act(async () => {
        await new BoardDomain(db, () => ({ boardId, restoring: false })).updateTaskTitle(taskId, '另一入口标题');
      });
      await waitFor(() => expect(titlesIn(columnByTitle('To do'))).toContain('另一入口标题'));
      fireEvent.click(byTestId('detail-column'));
      fireEvent.click(allByTestId('picker-option').find(option => option.textContent?.includes('Doing'))!);
      await waitFor(() => expect(titlesIn(columnByTitle('Doing'))).toContain('另一入口标题'));
      typeInto(byTestId('detail-title'), '本地草稿', 'Enter');
      await waitFor(() => expect(texts('board-notice')[0]).toContain('其它入口修改'));
      expect(inputValue('detail-title')).toBe('本地草稿');
      expect(titlesIn(columnByTitle('Doing'))).toContain('另一入口标题');
    });
  });
});
