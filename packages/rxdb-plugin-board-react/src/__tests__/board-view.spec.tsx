import type { RxDB } from '@aiao/rxdb';
import { BoardDomain, matchAll, readFirst, RESTORING_MARKER_KEY, Task } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardView } from '../board-view.js';
import {
  allByTestId,
  byTestId,
  cardByTitle,
  columnByTitle,
  connectBoardDb,
  inputValue,
  isDisabled,
  memoryStorage,
  texts,
  titlesIn,
  typeInto,
  within,
  withinAll
} from './board-test-utils.js';

/**
 * BoardView 组件（看板 v2 的 React 半边）：真实 PGlite + 历史插件上的渲染与交互闭环，
 * 与 Angular 同名用例同组验收语义。真实拖拽、axe 与跨页恢复在 demo e2e。
 */
describe('BoardView（React 视图，看板 v2）', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
    vi.stubGlobal(
      'prompt',
      vi.fn(() => null)
    );
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false)
    );
    vi.stubGlobal('localStorage', memoryStorage());
    rxdb = await connectBoardDb('board-view-react');
  });

  afterEach(async () => {
    // 看板 v2 不再使用浏览器原生弹窗
    expect(window.prompt).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    cleanup();
    vi.unstubAllGlobals();
    await rxdb.disconnectAll();
  });

  /** 选中项（逐项读 option.selected，与 e2e 的 `option:checked` 同口径；happy-dom 的 selectedOptions 偶发滞后）。 */
  const checkedTitle = (select: HTMLSelectElement): string | null =>
    [...select.options].find(option => option.selected)?.textContent ?? null;

  const mountSeeded = async (): Promise<void> => {
    await seedReleaseBoardDataset(rxdb);
    render(<BoardView rxdb={rxdb} />);
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12), { timeout: 5000 });
  };

  it('空库渲染空态；种子渲染板 / 列 / 任务，标签在标签对话框里', async () => {
    const empty = render(<BoardView rxdb={rxdb} />);
    expect(await screen.findByTestId('empty-board')).toBeTruthy();
    expect(screen.getByText('还没有看板')).toBeTruthy();
    empty.unmount();

    await mountSeeded();
    expect(texts('column-title')).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    expect(texts('column-count')).toEqual(['5', '4', '3', '0']);
    expect(texts('rename-board')).toEqual(['rxdb 1.0 发布计划']);
    await waitFor(() => expect(texts('card-label').length).toBeGreaterThan(0));
    fireEvent.click(byTestId('labels-open'));
    await waitFor(() => expect(texts('label-chip')).toEqual(['核心', '文档', '测试', '发布']));
  });

  it('新建看板 / 列 / 任务全程就地输入；建任务后输入框保持打开以便连续录入', async () => {
    render(<BoardView rxdb={rxdb} />);
    fireEvent.click(await screen.findByTestId('create-board-empty'));
    typeInto(byTestId('board-composer-input'), '看板 A', 'Enter');
    await waitFor(() => expect(screen.queryByTestId('create-column')).not.toBeNull());
    expect(texts('rename-board')).toEqual(['看板 A']);
    expect(screen.queryByTestId('board-composer')).toBeNull();

    fireEvent.click(byTestId('create-column'));
    typeInto(byTestId('column-composer-input'), 'C1', 'Enter');
    await waitFor(() => expect(allByTestId('column')).toHaveLength(1));
    expect(screen.queryByTestId('column-composer-input')).toBeNull();

    fireEvent.click(byTestId('add-task'));
    typeInto(byTestId('add-task-input'), '任务 1', 'Enter');
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(1));
    await waitFor(() => expect(isDisabled(byTestId('add-task-input'))).toBe(false));
    expect(inputValue('add-task-input')).toBe('');
    typeInto(byTestId('add-task-input'), '任务 2', 'Enter');
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(2));
    expect(texts('task-title')).toEqual(['任务 1', '任务 2']);
    await waitFor(() => expect(document.activeElement).toBe(byTestId('add-task-input')));
  });

  it('详情即改即存：标题 / 截止日 / 标签各成一个事务，可逐次撤销', async () => {
    await mountSeeded();
    fireEvent.click(within(cardByTitle('写发布说明'), 'task-title'));
    await screen.findByTestId('detail-panel');

    typeInto(byTestId('detail-title'), '写发布说明 v2', 'Enter');
    await waitFor(() => expect(cardByTitle('写发布说明 v2')).toBeTruthy());
    await waitFor(() => expect(texts('detail-status')).toEqual(['已保存']));
    fireEvent.change(byTestId('detail-due'), { target: { value: '2026-12-31' } });
    await waitFor(() => expect(texts('task-due')).toContain('2026-12-31'));
    fireEvent.click(byTestId('detail-labels'));
    const core = allByTestId('picker-option').find(option => option.textContent?.includes('核心'))!;
    fireEvent.click(core);
    expect(core.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(byTestId('picker-filter'), { key: 'Escape' });
    await waitFor(() => expect(withinAll(cardByTitle('写发布说明 v2'), 'card-label')).toHaveLength(2));
    expect(texts('detail-label')).toEqual(['核心', '文档']);

    await waitFor(() => expect(isDisabled(byTestId('undo'))).toBe(false));
    fireEvent.click(byTestId('undo'));
    await waitFor(() => expect(withinAll(cardByTitle('写发布说明 v2'), 'card-label')).toHaveLength(1));
    await waitFor(() => expect(texts('detail-label')).toEqual(['文档']));
    fireEvent.click(byTestId('undo'));
    await waitFor(() => expect(withinAll(cardByTitle('写发布说明 v2'), 'task-due')).toHaveLength(0));
    await waitFor(() => expect(inputValue('detail-due')).toBe(''));
    expect(inputValue('detail-title')).toBe('写发布说明 v2');
  });

  it('筛选条：标签 / 截止日组合，点击卡片标签切换，计数按结果重算', async () => {
    await mountSeeded();
    await waitFor(() => expect(texts('card-label').length).toBeGreaterThan(0));
    typeInto(byTestId('board-filter-input'), 'label:核心');
    expect(allByTestId('task-card')).toHaveLength(4);
    expect(texts('column-count')).toEqual(['2', '2', '0', '0']);
    expect(texts('board-filter-count')).toEqual(['4 项']);

    typeInto(byTestId('board-filter-input'), 'label:核心 due:none');
    expect(allByTestId('task-card')).toHaveLength(0);
    expect(texts('column-empty')).toContain('没有匹配筛选的任务');

    fireEvent.click(byTestId('board-filter-clear'));
    expect(allByTestId('task-card')).toHaveLength(12);
    const docLabel = allByTestId('card-label').find(element => element.textContent?.trim() === '文档')!;
    fireEvent.click(docLabel);
    expect(inputValue('board-filter-input')).toBe('label:文档');
    expect(allByTestId('task-card')).toHaveLength(2);
  });

  it('删除确认：取消零写；确认级联删除并给出可撤销提示', async () => {
    await mountSeeded();
    fireEvent.click(within(columnByTitle('Doing'), 'column-menu-trigger'));
    fireEvent.click(byTestId('column-delete'));
    expect((await screen.findByTestId('confirm-delete')).textContent).toContain('4 个任务');
    fireEvent.click(byTestId('confirm-delete-no'));
    expect(screen.queryByTestId('confirm-delete')).toBeNull();
    expect(allByTestId('column')).toHaveLength(4);

    fireEvent.click(within(columnByTitle('Doing'), 'column-menu-trigger'));
    fireEvent.click(byTestId('column-delete'));
    fireEvent.click(await screen.findByTestId('confirm-delete-yes'));
    await waitFor(() => expect(allByTestId('column')).toHaveLength(3));
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(8));
    expect(byTestId('board-toast').textContent).toContain('已删除列「Doing」');
    await waitFor(() => expect(isDisabled(byTestId('board-toast-undo'))).toBe(false));
    fireEvent.click(byTestId('board-toast-undo'));
    await waitFor(() => expect(allByTestId('column')).toHaveLength(4));
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12));
  });

  it('Alt + 方向键移动卡片并持久化，焦点跟随卡片', async () => {
    await mountSeeded();
    const card = cardByTitle('写发布说明');
    card.focus();
    fireEvent.keyDown(card, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(titlesIn(columnByTitle('To do'))[0]).toBe('写发布说明'));
    const tasks = await readFirst(rxdb.entityManager.getRepository(Task).find({ where: matchAll() }));
    const todo = tasks.find(task => task.title === '修复登录 bug')!.columnId;
    expect(tasks.filter(task => task.columnId === todo).map(task => task.title)[0]).toBe('写发布说明');
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-task-id')).toBe(card.getAttribute('data-task-id'))
    );
    expect(byTestId('board-toast').textContent).toContain('已移动到「To do」');
  });

  it('恢复中写入口禁用、浏览可用', async () => {
    await mountSeeded();
    localStorage.setItem(RESTORING_MARKER_KEY, 'restore-db');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: RESTORING_MARKER_KEY }));
    });
    await screen.findByTestId('restoring-note');
    expect(screen.getByTestId('restoring-badge')).toBeTruthy();
    for (const testId of ['create-board', 'create-column', 'undo']) expect(isDisabled(byTestId(testId))).toBe(true);
    expect(allByTestId('add-task').every(isDisabled)).toBe(true);
    expect(isDisabled(byTestId('labels-open'))).toBe(false);
    expect(allByTestId('task-card')[0].getAttribute('draggable')).toBe('false');
  });

  it('第二块板：新建后切到新板，选择器选中项跟随；切回不混数据', async () => {
    await mountSeeded();
    fireEvent.click(byTestId('create-board'));
    typeInto(byTestId('board-composer-input'), '第二块板', 'Enter');
    await waitFor(() => expect(texts('rename-board')).toEqual(['第二块板']));
    const selector = byTestId('board-selector') as HTMLSelectElement;
    await waitFor(() => expect(checkedTitle(selector)).toBe('第二块板'));
    expect(allByTestId('column')).toHaveLength(0);

    const main = [...selector.options].find(option => option.textContent === 'rxdb 1.0 发布计划')!;
    fireEvent.change(selector, { target: { value: main.value } });
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12));
    expect(checkedTitle(selector)).toBe('rxdb 1.0 发布计划');
  });

  it('删除确认后新增的任务：执行时按确认清单复核，拒绝并提示', async () => {
    await mountSeeded();
    fireEvent.click(within(columnByTitle('To do'), 'column-menu-trigger'));
    fireEvent.click(byTestId('column-delete'));
    expect((await screen.findByTestId('confirm-delete')).textContent).toContain('5 个任务');
    const todo = (await readFirst(rxdb.entityManager.getRepository(Task).find({ where: matchAll() }))).find(
      task => task.title === '修复登录 bug'
    )!.columnId;
    const boardId = (byTestId('board-selector') as HTMLSelectElement).value as Task['id'];
    await act(async () => {
      await new BoardDomain(rxdb, () => ({ boardId, restoring: false })).createTask({
        columnId: todo,
        title: '确认后新增'
      });
    });
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(13));
    fireEvent.click(byTestId('confirm-delete-yes'));
    await screen.findByTestId('board-notice');
    expect(allByTestId('column')).toHaveLength(4);
    expect(await readFirst(rxdb.entityManager.getRepository(Task).find({ where: matchAll() }))).toHaveLength(21);
  });

  it('导出备份只受写门禁限制：空库也能导出', async () => {
    const exportBackup = vi.fn(async () => undefined);
    render(<BoardView rxdb={rxdb} onExportBackup={exportBackup} />);
    await screen.findByTestId('empty-board');
    fireEvent.click(byTestId('board-menu-trigger'));
    expect(isDisabled(byTestId('export-backup'))).toBe(false);
    expect(isDisabled(byTestId('delete-board'))).toBe(true);
    fireEvent.click(byTestId('export-backup'));
    await waitFor(() => expect(exportBackup).toHaveBeenCalledOnce());
    await waitFor(() => expect(byTestId('board-toast').textContent).toContain('备份已生成'));
    expect(screen.queryByTestId('board-toast-undo')).toBeNull();
  });
});
