import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { LAST_BOARD_KEY, useBoard, type UseBoardOptions, type UseBoardReturn } from '../use-board.js';

/**
 * useBoard 桥接（Vue）：真实 PGlite + 历史插件，与 Angular / React 同组验收语义。
 */
describe('useBoard（Vue 桥接）', () => {
  let rxdb: RxDB;
  let holder: { current: UseBoardReturn | null };
  const cleanups: (() => void)[] = [];
  const mountBoard = (options: UseBoardOptions | undefined, receive: (value: UseBoardReturn) => void) => {
    const Probe = defineComponent({
      setup() {
        receive(useBoard(rxdb, options));
        return () => h('div');
      }
    });
    const fixture = mount(Probe);
    cleanups.push(() => fixture.unmount());
    return fixture;
  };

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
    mountBoard({ storage: { get: () => null, set: () => undefined } }, value => {
      holder.current = value;
    });
    if (!holder.current) throw new Error('useBoard 未返回');
  });

  afterEach(async () => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    vi.unstubAllGlobals();
    await rxdb.disconnectAll();
  });

  const board = (): UseBoardReturn => holder.current!;

  it('删除当前板重新选中有效板，清空后重建仍自动打开', async () => {
    const first = await board().actions.createBoard({ title: '旧板' });
    await waitFor(() => board().currentBoardId.value === first.id, '选中旧板');
    const second = await board().actions.createBoard({ title: '保留板' });
    await waitFor(() => board().boards.value.length === 2, '两块板');
    expect(board().currentBoardId.value).toBe(first.id);
    const firstPlan = await board().actions.planBoardDelete(first.id);
    await board().actions.executeDelete(firstPlan);
    await waitFor(() => board().currentBoardId.value === second.id, '选中剩余板');
    const secondPlan = await board().actions.planBoardDelete(second.id);
    await board().actions.executeDelete(secondPlan);
    await waitFor(() => board().boards.value.length === 0, '清空看板');
    expect(board().currentBoardId.value).toBeNull();
    const next = await board().actions.createBoard({ title: '新板' });
    await waitFor(() => board().currentBoardId.value === next.id, '选中新板');
  });

  it('恢复中直接调用撤销重做也拒绝，历史计数保持不变', async () => {
    const created = await board().actions.createBoard({ title: '板' });
    await waitFor(() => board().currentBoard.value?.id === created.id, '进入板');
    const count = board().undoCount.value;
    board().setRestoring(true);
    await expect(board().actions.undo()).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(board().actions.redo()).rejects.toMatchObject({ code: 'restore_in_progress' });
    expect(board().undoCount.value).toBe(count);
    expect(board().boards.value).toHaveLength(1);
  });

  it('默认存储使用浏览器 Storage，并在重新挂载时恢复上次选择', async () => {
    const first = await board().actions.createBoard({ title: '板 1' });
    await waitFor(() => board().currentBoard.value?.id === first.id, '进入第一块板');
    const second = await board().actions.createBoard({ title: '板 2' });
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    });
    let result: UseBoardReturn | undefined;
    const initial = mountBoard(undefined, value => {
      result = value;
    });
    await waitFor(() => result?.boards.value.length === 2, '加载看板');
    result!.selectBoard(second.id);
    expect(values.get(LAST_BOARD_KEY)).toBe(second.id);
    initial.unmount();
    const reopened = mountBoard(undefined, value => {
      result = value;
    });
    await waitFor(() => result?.currentBoard.value?.id === second.id, '恢复上次看板');
    reopened.unmount();
  });

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
    const secondary = await board().actions.createLabel({ name: '次要', color: '#2563eb' });
    const snapshot = await board().actions.openSnapshot(task.id);
    await board().actions.saveTaskDraft(task.id, snapshot, {
      title: snapshot.title,
      description: snapshot.description ?? '',
      dueDate: snapshot.dueDate,
      labelIds: [secondary.id, label.id]
    });
    await waitFor(() => (board().taskLabels.value.get(task.id) ?? []).length === 2, '任务标签');
    expect(board().taskLabels.value.get(task.id)?.map(item => item.name)).toEqual(['核心', '次要']);

    board().setRestoring(true);
    await expect(board().actions.createTask({ columnId: c1.id, title: 'x' })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    board().setRestoring(false);

    await waitFor(() => board().undoCount.value >= 1, 'undo 计数');
    await board().actions.undo();
    await waitFor(() => board().tasks.value.find(t => t.id === task.id)?.title === '任务', 'undo 回退');
  });

  it('公开动作贯通领域服务：重命名、移动、排序、标签与级联删除', async () => {
    const created = await board().actions.createBoard({ title: '板' });
    await waitFor(() => board().currentBoard.value?.id === created.id, '进入板');
    const first = await board().actions.createColumn({ title: '列一' });
    const second = await board().actions.createColumn({ title: '列二' });
    const task = await board().actions.createTask({ columnId: first.id, title: '任务' });
    const another = await board().actions.createTask({ columnId: first.id, title: '另一个任务' });
    await board().actions.updateBoard(created.id, { title: '新看板' });
    await board().actions.updateColumn(first.id, { title: '新列名' });
    await board().actions.updateTaskTitle(task.id, '新任务名');
    await board().actions.moveTask(task.id, { kind: 'end', columnId: second.id });
    await board().actions.moveColumn(second.id, { prevId: null, nextId: first.id });
    await board().actions.sortColumn(first.id, 'title');
    const label = await board().actions.createLabel({ name: '标签', color: '#123456' });
    await board().actions.renameLabel(label.id, '新标签');
    await board().actions.recolorLabel(label.id, '#abcdef');
    await board().actions.executeLabelDelete(await board().actions.planLabelDelete(label.id));
    await board().actions.executeDelete(await board().actions.planTaskDelete(another.id));
    await board().actions.executeDelete(await board().actions.planColumnDelete(second.id));
    await waitFor(() => board().columns.value.length === 1, '列删除完成');
    await board().actions.executeDelete(await board().actions.planBoardDelete(created.id));
    await waitFor(() => board().boards.value.length === 0, '删除看板');
    await board().actions.undo();
    await board().actions.redo();
    await waitFor(() => board().boards.value.length === 0, '重做删除');
  });
});
