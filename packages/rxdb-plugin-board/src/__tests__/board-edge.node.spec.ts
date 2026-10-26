import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { BoardColumnSortService } from '../column-sort-service.js';
import { BoardDeleteService } from '../delete-service.js';
import { resolveColumnDrop } from '../drop-resolution.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { BoardLabelService } from '../label-service.js';
import { BoardMoveService } from '../move-service.js';
import { matchAll, readFirst, whereEq } from '../query.js';
import { isValidDueDate, normalizeBoardTitle } from '../title.js';
import { BoardWriteNotifier } from '../write-notifier.js';

/** 边界与错误分支的定向用例：补齐覆盖率缺口并钉住可判别行为。 */
describe('看板领域边界用例', () => {
  let rxdb: RxDB;
  let domain: BoardDomain;
  let deletes: BoardDeleteService;
  let moves: BoardMoveService;
  let sorts: BoardColumnSortService;
  let notifier: BoardWriteNotifier;
  let events: { kind: string; columnId?: string }[];
  let ctx: { boardId: UUID | null; restoring: boolean };

  const columnRepo = () => rxdb.entityManager.getRepository(Column);

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-edge-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);
    deletes = new BoardDeleteService(rxdb, () => ctx);
    notifier = new BoardWriteNotifier();
    events = [];
    notifier.events$.subscribe(event =>
      events.push({ kind: event.kind, columnId: 'columnId' in event ? event.columnId : undefined })
    );
    moves = new BoardMoveService(rxdb, () => ctx, notifier);
    sorts = new BoardColumnSortService(rxdb, () => ctx, notifier);
  });

  afterEach(async () => {
    notifier.complete();
    if (rxdb) await rxdb.disconnectAll();
  });

  it('纯日期校验：合法 / 非法 / 闰日 / 格式（US-536 AC#13 服务层）', () => {
    expect(isValidDueDate('2024-02-29')).toBe(true);
    expect(isValidDueDate('2026-02-29')).toBe(false);
    expect(isValidDueDate('2026-13-01')).toBe(false);
    expect(isValidDueDate('2026-00-10')).toBe(false);
    expect(isValidDueDate('2026-04-31')).toBe(false);
    expect(isValidDueDate('2026-04-30')).toBe(true);
    expect(isValidDueDate('2026-1-01')).toBe(false);
    expect(isValidDueDate('abcd-ef-gh')).toBe(false);
    expect(normalizeBoardTitle('  标题  ')).toBe('标题');
    expect(normalizeBoardTitle(' \t ')).toBeNull();
    expect(normalizeBoardTitle(42)).toBeNull();
  });

  it('无当前板时建列 / 改列给出 board_not_found', async () => {
    await expect(domain.createColumn({ title: 'x' })).rejects.toMatchObject({ code: 'board_not_found' });
    await expect(domain.updateColumn('00000000-0000-4000-8000-0000000000aa', { title: 'x' })).rejects.toMatchObject({
      code: 'board_not_found'
    });
  });

  it('改板只能修改当前板', async () => {
    const first = await domain.createBoard({ title: '第一块板' });
    const second = await domain.createBoard({ title: '第二块板' });

    ctx.boardId = first.id;
    await expect(domain.updateBoard(second.id, { title: '不应修改' })).rejects.toMatchObject({ code: 'cross_board' });
    await expect(domain.updateBoard(first.id, { title: '当前板已修改' })).resolves.toMatchObject({
      id: first.id,
      title: '当前板已修改'
    });

    ctx.boardId = null;
    await expect(domain.updateBoard(first.id, { title: '没有当前板' })).rejects.toMatchObject({ code: 'board_not_found' });
  });

  it('任务与板不存在时给出可判别错误；listTasksOfBoard 汇总板内任务', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    await expect(domain.updateTaskTitle('00000000-0000-4000-8000-0000000000ff', 'x')).rejects.toMatchObject({
      code: 'task_not_found'
    });
    await expect(domain.requireBoard('00000000-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      code: 'board_not_found'
    });

    const c1 = await domain.createColumn({ title: 'C1' });
    const c2 = await domain.createColumn({ title: 'C2' });
    await domain.createTask({ columnId: c1.id, title: 't1' });
    await domain.createTask({ columnId: c1.id, title: 't2' });
    await domain.createTask({ columnId: c2.id, title: 't3' });
    expect(await domain.listTasksOfBoard(board.id)).toHaveLength(3);

    const emptyBoard = await domain.createBoard({ title: '空板' });
    expect(await domain.listTasksOfBoard(emptyBoard.id)).toHaveLength(0);
  });

  it('改板描述与标题只写给定字段', async () => {
    const board = await domain.createBoard({ title: 'B', description: 'd1' });
    ctx.boardId = board.id;
    const updated = await domain.updateBoard(board.id, { description: 'd2' });
    expect(updated.description).toBe('d2');
    expect(updated.title).toBe('B');
    const renamed = await domain.updateBoard(board.id, { title: '  B2  ' });
    expect(renamed.title).toBe('B2');
  });

  it('拖列：板内列序重排（US-535 列序路径）', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    const c1 = await domain.createColumn({ title: 'C1' });
    const c2 = await domain.createColumn({ title: 'C2' });
    const c3 = await domain.createColumn({ title: 'C3' });

    // 把 C3 拖到 C1 之前
    const target = resolveColumnDrop(
      [
        { columnId: c1.id, rect: { left: 0, right: 100 } },
        { columnId: c2.id, rect: { left: 100, right: 200 } },
        { columnId: c3.id, rect: { left: 200, right: 300 } }
      ],
      [c1.id, c2.id, c3.id],
      c3.id,
      10
    );
    expect(target).toEqual({ prevId: null, nextId: c1.id });
    await moves.moveColumn(c3.id, target!);
    expect((await readFirst(columnRepo().find({ where: whereEq('boardId', board.id) }))).map(c => c.id)).toEqual([
      c3.id,
      c1.id,
      c2.id
    ]);
    expect(events).toContainEqual({ kind: 'column-move-committed', columnId: c3.id });

    // 原位：拖 C3 到它自己列头 → 拒绝落点（null）
    const inPlace = resolveColumnDrop(
      [{ columnId: c3.id, rect: { left: 0, right: 100 } }],
      [c3.id, c1.id, c2.id],
      c3.id,
      50
    );
    expect(inPlace).toBeNull();
  });

  it('拖列失败：列不在当前板 → cross_board，状态机发布失败', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    const c1 = await domain.createColumn({ title: 'C1' });
    const otherBoard = await domain.createBoard({ title: '异板' });
    ctx.boardId = otherBoard.id;
    const foreign = await domain.createColumn({ title: '异板列' });

    await expect(moves.moveColumn(c1.id, { prevId: null, nextId: foreign.id })).rejects.toMatchObject({
      code: 'cross_board'
    });
    expect(events.some(e => e.kind === 'column-move-failed' && e.columnId === c1.id)).toBe(true);
    void board;
  });

  it('本列排序失败路径：列不存在 → sort-failed 发布且重抛', async () => {
    await domain.createBoard({ title: 'B' });
    ctx.boardId = (await readFirst(rxdb.entityManager.getRepository(Board).find({ where: matchAll() })))[0].id;
    await expect(sorts.sortColumn('00000000-0000-4000-8000-0000000000ff', 'title')).rejects.toMatchObject({
      code: 'column_not_found'
    });
    expect(events.some(e => e.kind === 'sort-failed' && e.columnId === '00000000-0000-4000-8000-0000000000ff')).toBe(
      true
    );
  });

  it('板删除的确认集合变化：新增板级标签后零写退出', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    const plan = await deletes.planBoardDelete(board.id);
    // 确认前新增板级标签 → 集合变化
    await rxdb.entityManager
      .getRepository(BoardLabel)
      .create(rxdb.entityManager.instantiate(BoardLabel, { boardId: board.id, name: '新标签', color: '#000000' }));

    await expect(deletes.executeDelete(plan)).rejects.toMatchObject({ code: 'confirm_stale' });
    expect(
      await readFirst(rxdb.entityManager.getRepository(Board).find({ where: whereEq('id', board.id) }))
    ).toHaveLength(1);
  });

  it('describeBoardFailure 对非 Error 值也给出可展示文本', async () => {
    const { describeBoardFailure } = await import('../write-notifier.js');
    expect(describeBoardFailure('字符串错误')).toBe('字符串错误');
    expect(describeBoardFailure(new Error('真实错误'))).toContain('真实错误');
  });

  it('标签颜色必须是 #rgb / #rrggbb，非法格式显式拒绝（US-539 AC#6）', async () => {
    const labels = new BoardLabelService(rxdb, () => ctx);
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    const label = await labels.createLabel({ name: '合法', color: '#16a34a' });
    await expect(labels.createLabel({ name: '非法', color: 'red' })).rejects.toMatchObject({ code: 'invalid_color' });
    await expect(labels.recolorLabel(label.id, '#12345')).rejects.toMatchObject({ code: 'invalid_color' });
    expect(await readFirst(rxdb.entityManager.getRepository(BoardLabel).find({ where: matchAll() }))).toHaveLength(1);
  });

  it('任务不存在时 requireTaskInBoard 可判别', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    await expect(domain.requireTaskInBoard('00000000-0000-4000-8000-0000000000ff', board.id)).rejects.toMatchObject({
      code: 'task_not_found'
    });
  });

  it('跨板任务存在但拒绝：requireTaskInBoard 经列推导判 cross_board', async () => {
    const boardA = await domain.createBoard({ title: 'A' });
    ctx.boardId = boardA.id;
    const columnA = await domain.createColumn({ title: 'A 列' });
    const taskA = await domain.createTask({ columnId: columnA.id, title: 't' });

    const boardB = await domain.createBoard({ title: 'B' });
    ctx.boardId = boardB.id;
    await expect(domain.requireTaskInBoard(taskA.id, boardB.id)).rejects.toMatchObject({ code: 'cross_board' });
    await expect(domain.updateTaskTitle(taskA.id, 'x')).rejects.toMatchObject({ code: 'cross_board' });
  });

  it('恢复中：删除、移动、排序同样被门禁拒绝', async () => {
    const board = await domain.createBoard({ title: 'B' });
    ctx.boardId = board.id;
    const c1 = await domain.createColumn({ title: 'C1' });
    const task = await domain.createTask({ columnId: c1.id, title: 't' });

    ctx.restoring = true;
    await expect(deletes.planTaskDelete(task.id)).rejects.toMatchObject({ code: 'restore_in_progress' });
    await expect(
      deletes.executeDelete({ kind: 'task', taskId: task.id, taskTitle: 't', taskLabelIds: [] })
    ).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    await expect(moves.moveTask(task.id, { kind: 'end', columnId: c1.id })).rejects.toMatchObject({
      code: 'restore_in_progress'
    });
    await expect(sorts.sortColumn(c1.id, 'title')).rejects.toMatchObject({ code: 'restore_in_progress' });
    ctx.restoring = false;
  });
});
