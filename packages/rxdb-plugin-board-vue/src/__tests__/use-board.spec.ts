import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import { useBoard, type UseBoardReturn } from '../use-board.js';

/**
 * useBoard 桥接（Vue）：真实 PGlite + 历史插件，与 Angular / React 同组验收语义。
 */
describe('useBoard（Vue 桥接）', () => {
  let rxdb: RxDB;
  let holder: { current: UseBoardReturn | null };

  const waitFor = async (probe: () => boolean, label: string, timeoutMs = 5000): Promise<void> => {
    const start = Date.now();
    while (!probe()) {
      if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-vue-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');

    holder = { current: null };
    const Probe = defineComponent({
      setup() {
        holder.current = useBoard(rxdb, { storage: { get: () => null, set: () => undefined } });
        return () => h('div');
      }
    });
    mount(Probe);
    if (!holder.current) throw new Error('useBoard 未返回');
  });

  afterEach(async () => {
    await rxdb.disconnectAll();
  });

  const board = (): UseBoardReturn => holder.current!;

  it('空库建板进入第一块；建列建任务后数据就位', async () => {
    const created = await board().actions.createBoard({ title: '发布计划' });
    await waitFor(() => board().currentBoard.value?.id === created.id, '进入第一块板');
    expect(board().boards.value.map(b => b.title)).toEqual(['发布计划']);

    const c1 = await board().actions.createColumn({ title: 'To do' });
    const c2 = await board().actions.createColumn({ title: 'Done' });
    await board().actions.createTask({ columnId: c1.id, title: '任务 1' });
    await board().actions.createTask({ columnId: c2.id, title: '任务 2' });
    await waitFor(() => board().columns.value.length === 2 && board().tasks.value.length === 2, '数据');
    expect(board().columns.value.map(column => column.title)).toEqual(['To do', 'Done']);
  });

  it('切板只显示所选板数据', async () => {
    const b1 = await board().actions.createBoard({ title: '板 1' });
    await waitFor(() => board().currentBoard.value?.id === b1.id, '进入板 1');
    const c1 = await board().actions.createColumn({ title: 'C1' });
    await board().actions.createTask({ columnId: c1.id, title: '板 1 任务' });

    const b2 = await board().actions.createBoard({ title: '板 2' });
    board().selectBoard(b2.id);
    await waitFor(() => board().currentBoard.value?.id === b2.id && board().tasks.value.length === 0, '切到板 2');
    board().selectBoard(b1.id);
    await waitFor(() => board().tasks.value.length === 1, '切回板 1');
    expect(board().tasks.value[0].title).toBe('板 1 任务');
  });

  it('标签求交、恢复中门禁与 undo 计数', async () => {
    const b1 = await board().actions.createBoard({ title: '板' });
    await waitFor(() => board().currentBoard.value?.id === b1.id, '进入板');
    const c1 = await board().actions.createColumn({ title: 'C1' });
    const task = await board().actions.createTask({ columnId: c1.id, title: '任务' });
    const label = await board().actions.createLabel({ name: '核心', color: '#e11d48' });
    const snapshot = await board().actions.openSnapshot(task.id);
    await board().actions.saveTaskDraft(task.id, snapshot, {
      title: snapshot.title,
      description: snapshot.description ?? '',
      dueDate: snapshot.dueDate,
      labelIds: [label.id]
    });
    await waitFor(() => (board().taskLabels.value.get(task.id) ?? []).length === 1, '任务标签');
    expect(board().taskLabels.value.get(task.id)?.[0].name).toBe('核心');

    board().setRestoring(true);
    await expect(board().actions.createTask({ columnId: c1.id, title: 'x' })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    board().setRestoring(false);

    await waitFor(() => board().undoCount.value >= 1, 'undo 计数');
    await board().actions.undo();
    await waitFor(() => board().tasks.value.find(t => t.id === task.id)?.title === '任务', 'undo 回退');
  });
});
