import { TestBed } from '@angular/core/testing';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useBoard, type UseBoardReturn } from '../use-board.js';

/**
 * useBoard 桥接（US-531 阶段 A 的领域数据半边）：真实 PGlite + 历史插件。
 * 三端视图与交互在各自 demo 的 e2e 验收；本套用例钉住 signal 桥接、
 * 切板过滤、动作透传与恢复中门禁。
 */
describe('useBoard（Angular 桥接）', () => {
  let rxdb: RxDB;
  let board: UseBoardReturn;

  const waitFor = async (probe: () => boolean, label: string, timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (!probe()) {
      if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-ng-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      // happy-dom 无 BroadcastChannel；多页面网关语义归 demo e2e 验收
      multiInstance: false
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    board = TestBed.runInInjectionContext(() =>
      useBoard(rxdb, {
        storage: { get: () => null, set: () => undefined }
      })
    );
  });

  afterEach(async () => {
    await rxdb.disconnectAll();
  });

  it('空库建板 → 进入第一块板；建列建任务后数据 signal 就位', async () => {
    const created = await board.actions.createBoard({ title: '发布计划' });
    await waitFor(() => board.currentBoard()?.id === created.id, '进入第一块板');
    expect(board.boards().map(b => b.title)).toEqual(['发布计划']);

    const c1 = await board.actions.createColumn({ title: 'To do' });
    const c2 = await board.actions.createColumn({ title: 'Done' });
    const t1 = await board.actions.createTask({ columnId: c1.id, title: '任务 1' });
    await board.actions.createTask({ columnId: c1.id, title: '任务 2' });
    await board.actions.createTask({ columnId: c2.id, title: '任务 3' });

    await waitFor(() => board.columns().length === 2, '列数据');
    await waitFor(() => board.tasks().length === 3, '任务数据');
    expect(board.columns().map(column => column.title)).toEqual(['To do', 'Done']);
    expect(board.tasks().every(task => task.title.startsWith('任务'))).toBe(true);
    expect(board.tasks().filter(task => task.columnId === c1.id)).toHaveLength(2);
    expect(board.tasks().filter(task => task.columnId === c2.id)).toHaveLength(1);
  });

  it('切板只显示所选板的数据，且本地记录被写入', async () => {
    const b1 = await board.actions.createBoard({ title: '板 1' });
    await waitFor(() => board.currentBoard()?.id === b1.id, '进入板 1');
    const c1 = await board.actions.createColumn({ title: 'C1' });
    await board.actions.createTask({ columnId: c1.id, title: '板 1 任务' });

    const b2 = await board.actions.createBoard({ title: '板 2' });
    board.selectBoard(b2.id);
    await waitFor(() => board.currentBoard()?.id === b2.id, '切到板 2');
    await waitFor(() => board.columns().length === 0 && board.tasks().length === 0, '板 2 空数据');

    board.selectBoard(b1.id);
    await waitFor(() => board.tasks().length === 1, '切回板 1');
    expect(board.tasks()[0].title).toBe('板 1 任务');
  });

  it('标签与任务标签求交；改名改色反映到卡片数据', async () => {
    const b1 = await board.actions.createBoard({ title: '板' });
    await waitFor(() => board.currentBoard()?.id === b1.id, '进入板');
    const c1 = await board.actions.createColumn({ title: 'C1' });
    const task = await board.actions.createTask({ columnId: c1.id, title: '任务' });
    const label = await board.actions.createLabel({ name: '核心', color: '#e11d48' });
    const snapshot = await board.actions.openSnapshot(task.id);
    await board.actions.saveTaskDraft(task.id, snapshot, { ...snapshot, title: snapshot.title, labelIds: [label.id] });

    await waitFor(() => (board.taskLabels().get(task.id) ?? []).length === 1, '任务标签');
    expect(board.taskLabels().get(task.id)?.[0].name).toBe('核心');

    await board.actions.renameLabel(label.id, '核心功能');
    await waitFor(() => board.taskLabels().get(task.id)?.[0].name === '核心功能', '改名反映');
  });

  it('恢复中门禁：动作拒绝且数据流不变', async () => {
    const b1 = await board.actions.createBoard({ title: '板' });
    await waitFor(() => board.currentBoard()?.id === b1.id, '进入板');
    const c1 = await board.actions.createColumn({ title: 'C1' });

    board.setRestoring(true);
    expect(board.restoring()).toBe(true);
    await expect(board.actions.createTask({ columnId: c1.id, title: 'x' })).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(board.actions.createColumn({ title: 'C2' })).rejects.toMatchObject({ code: 'restore_in_progress' });

    board.setRestoring(false);
    const created = await board.actions.createTask({ columnId: c1.id, title: '恢复后可写' });
    expect(created.title).toBe('恢复后可写');
  });

  it('一次保存一个事务：undo 计数递增，undo 后整体回退', async () => {
    const b1 = await board.actions.createBoard({ title: '板' });
    await waitFor(() => board.currentBoard()?.id === b1.id, '进入板');
    const c1 = await board.actions.createColumn({ title: 'C1' });
    const task = await board.actions.createTask({ columnId: c1.id, title: '任务' });
    const snapshot = await board.actions.openSnapshot(task.id);
    await board.actions.saveTaskDraft(task.id, snapshot, { ...snapshot, title: '改', dueDate: '2026-12-31' });
    await waitFor(() => board.undoCount() >= 1, 'undo 计数');

    await board.actions.undo();
    await waitFor(() => board.tasks().find(t => t.id === task.id)?.title === '任务', 'undo 回退');
  });

  it('本列排序经绑定动作执行并发布写入事件', async () => {
    const b1 = await board.actions.createBoard({ title: '板' });
    await waitFor(() => board.currentBoard()?.id === b1.id, '进入板');
    const c1 = await board.actions.createColumn({ title: 'C1' });
    await board.actions.createTask({ columnId: c1.id, title: 'c' });
    await board.actions.createTask({ columnId: c1.id, title: 'a' });
    await board.actions.createTask({ columnId: c1.id, title: 'b' });

    const result = await board.actions.sortColumn(c1.id, 'title');
    expect(result.written).toBe(true);
    await waitFor(() => board.tasks().map(t => t.title).join(',') === 'a,b,c', '排序生效');
    await waitFor(() => board.writeEvent()?.kind === 'sort-committed', '写入事件');
  });
});
