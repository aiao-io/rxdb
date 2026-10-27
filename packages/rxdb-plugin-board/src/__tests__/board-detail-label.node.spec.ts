import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BoardDomain } from '../board-domain.js';
import { BoardDeleteService } from '../delete-service.js';
import { BoardDetailService, type TaskDraftSnapshot } from '../detail-service.js';
import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';
import { BoardLabelService } from '../label-service.js';
import { matchAll, readFirst, whereEq } from '../query.js';

/**
 * 任务详情与标签（US-536）：真实 PGlite + 历史插件。
 * 详情面板的三端交互在 US-539 阶段 A 验收；本套用例钉住草稿差集、一次保存原子、
 * 快照复核拒绝与标签级联的服务层语义。
 */
describe('BoardDetailService / BoardLabelService（US-536）', () => {
  let rxdb: RxDB;
  let domain: BoardDomain;
  let details: BoardDetailService;
  let labels: BoardLabelService;
  let deletes: BoardDeleteService;
  let ctx: { boardId: UUID | null; restoring: boolean };

  const taskRepo = () => rxdb.entityManager.getRepository(Task);
  const labelRepo = () => rxdb.entityManager.getRepository(BoardLabel);
  const linkRepo = () => rxdb.entityManager.getRepository(TaskLabel);

  const taskOf = async (id: UUID) => (await readFirst(taskRepo().find({ where: whereEq('id', id) })))[0];
  const linksOf = (taskId: UUID) => readFirst(linkRepo().find({ where: whereEq('taskId', taskId) }));

  /**
   * 快照 → 草稿：TaskDraft 不含 columnId（列在保存时重查），描述取非空串，
   * 空串由服务归一化为 null（US-536 AC#8）。
   */
  const draftFrom = (
    snapshot: TaskDraftSnapshot,
    patch: {
      title?: string;
      description?: string;
      dueDate?: string | null;
      labelIds?: readonly UUID[];
    }
  ) => ({
    title: patch.title ?? snapshot.title,
    description: patch.description ?? snapshot.description ?? '',
    dueDate: patch.dueDate !== undefined ? patch.dueDate : snapshot.dueDate,
    labelIds: patch.labelIds ?? snapshot.labelIds
  });

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `board-detail-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
    ctx = { boardId: null, restoring: false };
    domain = new BoardDomain(rxdb, () => ctx);
    details = new BoardDetailService(rxdb, () => ctx);
    labels = new BoardLabelService(rxdb, () => ctx);
    deletes = new BoardDeleteService(rxdb, () => ctx);
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const seedTask = async () => {
    const board = await domain.createBoard({ title: '板' });
    ctx.boardId = board.id;
    const column = await domain.createColumn({ title: 'C1' });
    const task = await domain.createTask({ columnId: column.id, title: '任务' });
    return { board, column, task };
  };

  it('切板后拒绝执行旧标签删除清单，标签与关联都保留', async () => {
    const { task } = await seedTask();
    const label = await labels.createLabel({ name: '归属标签', color: '#ff0000' });
    const snapshot = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { labelIds: [label.id] }));
    const plan = await labels.planLabelDelete(label.id);
    ctx.boardId = (await domain.createBoard({ title: '另一块板' })).id;
    await expect(labels.executeLabelDelete(plan)).rejects.toMatchObject({ code: 'cross_board' });
    expect(await readFirst(labelRepo().find({ where: whereEq('id', label.id) }))).toHaveLength(1);
    expect(await linksOf(task.id)).toHaveLength(1);
  });

  it('AC#1 / #5 / #8：一次保存原子提交，重开不丢；100 KiB 描述逐字读回', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);
    const bigDescription = 'a'.repeat(100 * 1024) + '\n换行保留';

    const result = await details.saveTaskDraft(task.id, snapshot, {
      title: '新标题',
      description: bigDescription,
      dueDate: '2026-12-31',
      labelIds: []
    });
    expect(result.kind).toBe('saved');

    const saved = await taskOf(task.id);
    expect(saved.title).toBe('新标题');
    expect(saved.description).toBe(bigDescription);
    expect(saved.dueDate).toBe('2026-12-31');
    // 重开语义：重新查询（fresh find）读到同一份数据
    const fresh = (await readFirst(taskRepo().find({ where: whereEq('id', task.id) })))[0];
    expect(fresh.description).toBe(bigDescription);
    expect(fresh.description?.endsWith('换行保留')).toBe(true);
  });

  it('标签颜色按 trim 归一落库：校验值与入库值一致', async () => {
    await seedTask();
    const label = await labels.createLabel({ name: '带空格颜色', color: ' #16a34a ' });
    expect(label.color).toBe('#16a34a');
    const recolored = await labels.recolorLabel(label.id, ' #e11d48 ');
    expect(recolored.color).toBe('#e11d48');
  });

  it('AC#2 / #14：标签板级定义 + 多对多引用；改名改色立即反映到引用卡片', async () => {
    const { task } = await seedTask();
    const l1 = await labels.createLabel({ name: '核心', color: '#e11d48' });
    const l2 = await labels.createLabel({ name: '文档', color: '#2563eb' });
    const snapshot = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { labelIds: [l1.id, l2.id] }));

    expect((await linksOf(task.id)).map(link => link.labelId).sort()).toEqual([l1.id, l2.id].sort());

    await labels.renameLabel(l1.id, '核心功能');
    await labels.recolorLabel(l1.id, '#000000');
    const renamed = (await readFirst(labelRepo().find({ where: whereEq('id', l1.id) })))[0];
    expect(renamed.name).toBe('核心功能');
    expect(renamed.color).toBe('#000000');
    // 引用卡片展示新定义：引用行不变，定义行变
    expect((await linksOf(task.id)).map(link => link.labelId)).toContain(l1.id);
  });

  it('AC#3 / #16：删标签原子清除全部关联；任务 / 列 / 板删除沿用同一份级联服务', async () => {
    const { board, column, task } = await seedTask();
    const task2 = await domain.createTask({ columnId: column.id, title: '任务 2' });
    const l1 = await labels.createLabel({ name: '标签', color: '#e11d48' });
    const snap1 = await details.openSnapshot(task.id);
    const snap2 = await details.openSnapshot(task2.id);
    await details.saveTaskDraft(task.id, snap1, draftFrom(snap1, { labelIds: [l1.id] }));
    await details.saveTaskDraft(task2.id, snap2, draftFrom(snap2, { labelIds: [l1.id] }));

    // 删标签：定义与全部引用原子移除
    const plan = await labels.planLabelDelete(l1.id);
    expect(plan.taskLabelIds).toHaveLength(2);
    await labels.executeLabelDelete(plan);
    expect(await readFirst(labelRepo().find({ where: whereEq('id', l1.id) }))).toHaveLength(0);
    expect(await readFirst(linkRepo().find({ where: matchAll() }))).toHaveLength(0);

    // 删任务 / 删列 / 删板沿用 US-534 服务：不留孤儿
    await domain.createTask({ columnId: column.id, title: '任务 3' });
    const l2 = await labels.createLabel({ name: '标签 2', color: '#16a34a' });
    const snap3 = await details.openSnapshot(task2.id);
    await details.saveTaskDraft(task2.id, snap3, draftFrom(snap3, { labelIds: [l2.id] }));
    const taskPlan = await deletes.planTaskDelete(task2.id);
    await deletes.executeDelete(taskPlan);
    expect(await readFirst(linkRepo().find({ where: whereEq('labelId', l2.id) }))).toHaveLength(0);
    expect(await readFirst(labelRepo().find({ where: whereEq('id', l2.id) }))).toHaveLength(1);

    const columnPlan = await deletes.planColumnDelete(column.id);
    await deletes.executeDelete(columnPlan);
    const boardPlan = await deletes.planBoardDelete(board.id);
    await deletes.executeDelete(boardPlan);
    expect(await readFirst(linkRepo().find({ where: matchAll() }))).toHaveLength(0);
    expect(await readFirst(labelRepo().find({ where: matchAll() }))).toHaveLength(0);
  });

  it('AC#4：同板重名拒绝零写，异板可建同名，空白名拒绝', async () => {
    const { board } = await seedTask();
    await labels.createLabel({ name: ' 工作 ', color: '#e11d48' });
    await expect(labels.createLabel({ name: '工作', color: '#2563eb' })).rejects.toMatchObject({
      code: 'duplicate_label'
    });
    await expect(labels.createLabel({ name: '   ', color: '#2563eb' })).rejects.toMatchObject({ code: 'empty_title' });
    await expect(labels.renameLabel('00000000-0000-4000-8000-0000000000ff', 'x')).rejects.toMatchObject({
      code: 'label_not_found'
    });

    const otherBoard = await domain.createBoard({ title: '异板' });
    ctx.boardId = otherBoard.id;
    const foreign = await labels.createLabel({ name: '工作', color: '#16a34a' });
    expect(foreign.name).toBe('工作');
    // 异板标签不能被当前板改名
    ctx.boardId = board.id;
    await expect(labels.renameLabel(foreign.id, 'x')).rejects.toMatchObject({ code: 'cross_board' });
  });

  it('AC#6 / #7：一次保存四类变更整体撤销 / 重放；三次保存对应三次 undo；刷新后不可撤销', async () => {
    const { task } = await seedTask();
    const l1 = await labels.createLabel({ name: '核心', color: '#e11d48' });
    const l2 = await labels.createLabel({ name: '文档', color: '#2563eb' });

    // 一次保存：标题 + 描述 + 截止日 + 标签（加 l1）
    const snap1 = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snap1, {
      title: '改 1',
      description: '描述 1',
      dueDate: '2026-12-01',
      labelIds: [l1.id]
    });
    // 第二次保存：改标签（加 l2）
    const snap2 = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snap2, draftFrom(snap2, { labelIds: [l1.id, l2.id] }));
    // 第三次保存：只改截止日
    const snap3 = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snap3, draftFrom(snap3, { dueDate: '2026-12-02' }));

    const history = rxdb.versionManager.history();
    await history.undo();
    expect((await taskOf(task.id)).dueDate).toBe('2026-12-01');
    expect((await linksOf(task.id)).map(link => link.labelId)).toContain(l2.id);
    await history.redo();
    expect((await taskOf(task.id)).dueDate).toBe('2026-12-02');

    // 三次保存 → 三次 undo 回到初始
    await history.undo();
    await history.undo();
    await history.undo();
    const initial = await taskOf(task.id);
    expect(initial.title).toBe('任务');
    expect(initial.dueDate).toBeNull();
    expect(await linksOf(task.id)).toHaveLength(0);

    // 新成功写入清空 redo 栈（失效是事件驱动的异步任务，轮询等待落定）
    const snap4 = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snap4, draftFrom(snap4, { title: '改 2' }));
    await waitForRedoCount(0);
  });

  it('AC#9：取消 / 无改动保存零写，不新增撤销项', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);
    const undoCountBefore = await firstUndoCount();

    const unchanged = await details.saveTaskDraft(task.id, snapshot, {
      title: snapshot.title,
      description: snapshot.description ?? '',
      dueDate: snapshot.dueDate,
      labelIds: snapshot.labelIds
    });
    expect(unchanged.kind).toBe('unchanged');
    expect((await taskOf(task.id)).title).toBe('任务');
    expect(await linksOf(task.id)).toHaveLength(0);
    expect(await firstUndoCount()).toBe(undoCountBefore);
  });

  it('AC#11：跨板标签引用与已删除标签引用整体拒绝且零写', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);

    const otherBoard = await domain.createBoard({ title: '异板' });
    ctx.boardId = otherBoard.id;
    const foreignLabel = await labels.createLabel({ name: '异板标签', color: '#e11d48' });
    ctx.boardId = (
      await readFirst(rxdb.entityManager.getRepository(Board).find({ where: whereEq('title', '板') }))
    )[0].id;

    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { labelIds: [foreignLabel.id] }))
    ).rejects.toMatchObject({ code: 'label_cross_board' });
    await expect(
      details.saveTaskDraft(
        task.id,
        snapshot,
        draftFrom(snapshot, { labelIds: ['00000000-0000-4000-8000-0000000000ff'] })
      )
    ).rejects.toMatchObject({ code: 'label_not_found' });
    expect((await taskOf(task.id)).title).toBe('任务');
    expect(await linksOf(task.id)).toHaveLength(0);
  });

  it('AC#12：内联与详情共用同一标题校验；非法日期零写拒绝；清空存 null', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);

    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { title: '   ', dueDate: null }))
    ).rejects.toMatchObject({
      code: 'empty_title'
    });
    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { title: 'x', dueDate: '2026-02-29' }))
    ).rejects.toMatchObject({ code: 'invalid_due_date' });
    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { title: 'x', dueDate: '2026-13-01' }))
    ).rejects.toMatchObject({ code: 'invalid_due_date' });

    // 合法闰日保留；清空存 null；内联改标题与详情保存共用校验
    const withLeap = await details.saveTaskDraft(
      task.id,
      snapshot,
      draftFrom(snapshot, { title: '改', dueDate: '2024-02-29' })
    );
    expect(withLeap.kind).toBe('saved');
    const afterLeap = await details.openSnapshot(task.id);
    expect(afterLeap.dueDate).toBe('2024-02-29');

    await domain.updateTaskTitle(task.id, '内联改');
    expect((await taskOf(task.id)).title).toBe('内联改');
    await expect(domain.updateTaskTitle(task.id, '  ')).rejects.toMatchObject({ code: 'empty_title' });

    // 内联改标题后重取快照，再清空截止日
    const afterInline = await details.openSnapshot(task.id);
    const cleared = await details.saveTaskDraft(task.id, afterInline, draftFrom(afterInline, { dueDate: null }));
    expect(cleared.kind).toBe('saved');
    expect((await taskOf(task.id)).dueDate).toBeNull();
  });

  it('AC#13：时区改变不改日期（纯日期串不经 Date 换算）', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);
    await details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { dueDate: '2026-12-31' }));
    // 保存与读回全程是字符串比较，任何时区下字节不变
    expect((await taskOf(task.id)).dueDate).toBe('2026-12-31');
    expect(typeof (await taskOf(task.id)).dueDate).toBe('string');
  });

  it('AC#15：打开后任务被删 / 字段被改 → 事务内复核失败零写', async () => {
    const { task } = await seedTask();
    const snapshot = await details.openSnapshot(task.id);

    // 另一入口改标题
    await domain.updateTaskTitle(task.id, '外部修改');
    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { title: '我的草稿' }))
    ).rejects.toMatchObject({
      code: 'task_stale'
    });
    expect((await taskOf(task.id)).title).toBe('外部修改');

    // 另一入口删任务
    const staleSnapshot = await details.openSnapshot(task.id);
    await deletes.executeDelete(await deletes.planTaskDelete(task.id));
    await expect(
      details.saveTaskDraft(task.id, staleSnapshot, draftFrom(staleSnapshot, { title: '复活？' }))
    ).rejects.toMatchObject({ code: 'task_stale' });
    // 不复活任务
    expect(await readFirst(taskRepo().find({ where: whereEq('id', task.id) }))).toHaveLength(0);
  });

  it('AC#10：字段与关联同事务——关联写入失败整批回滚（引用已删标签）', async () => {
    const { task } = await seedTask();
    const l1 = await labels.createLabel({ name: '核心', color: '#e11d48' });
    const snapshot = await details.openSnapshot(task.id);

    // 草稿包含 l1，但保存前 l1 已被删 → 事务内 label_not_found，字段与关联全部零写
    await labels.executeLabelDelete(await labels.planLabelDelete(l1.id));
    await expect(
      details.saveTaskDraft(task.id, snapshot, draftFrom(snapshot, { title: '改', labelIds: [l1.id] }))
    ).rejects.toMatchObject({ code: 'label_not_found' });
    expect((await taskOf(task.id)).title).toBe('任务');
    expect(await linksOf(task.id)).toHaveLength(0);
  });

  describe('saveTaskFields（看板 v2 即改即存）', () => {
    it('每次只提交补丁里的字段，各成一个事务、可逐次撤销', async () => {
      const { task } = await seedTask();
      const label = await labels.createLabel({ name: '核心', color: '#e11d48' });
      const base = await details.openSnapshot(task.id);

      await details.saveTaskFields(task.id, base, { title: '改标题' });
      await details.saveTaskFields(task.id, base, { dueDate: '2026-12-01' });
      await details.saveTaskFields(task.id, base, { labelIds: [label.id] });

      const saved = await taskOf(task.id);
      expect(saved.title).toBe('改标题');
      expect(saved.dueDate).toBe('2026-12-01');
      expect((await linksOf(task.id)).map(link => link.labelId)).toEqual([label.id]);

      const history = rxdb.versionManager.history();
      await history.undo();
      expect(await linksOf(task.id)).toHaveLength(0);
      expect((await taskOf(task.id)).dueDate).toBe('2026-12-01');
      await history.undo();
      expect((await taskOf(task.id)).dueDate).toBeNull();
      expect((await taskOf(task.id)).title).toBe('改标题');
    });

    it('清空截止日与描述：null / 空串落库为 null；与最新值相同则零写', async () => {
      const { task } = await seedTask();
      const base = await details.openSnapshot(task.id);
      await details.saveTaskFields(task.id, base, { dueDate: '2026-12-01', description: '描述' });
      const filled = await details.openSnapshot(task.id);
      await details.saveTaskFields(task.id, filled, { dueDate: null, description: '' });
      const cleared = await taskOf(task.id);
      expect(cleared.dueDate).toBeNull();
      expect(cleared.description).toBeNull();
      const undoCount = await firstUndoCount();
      const result = await details.saveTaskFields(task.id, await details.openSnapshot(task.id), { dueDate: null });
      expect(result.kind).toBe('unchanged');
      expect(await firstUndoCount()).toBe(undoCount);
    });

    it('字段级冲突：补丁涉及的字段被其它入口改过则拒绝零写，其它字段的外部修改不冲突', async () => {
      const { task } = await seedTask();
      const base = await details.openSnapshot(task.id);

      await domain.updateTaskTitle(task.id, '外部修改');
      await expect(details.saveTaskFields(task.id, base, { title: '我的草稿' })).rejects.toMatchObject({
        code: 'task_stale'
      });
      expect((await taskOf(task.id)).title).toBe('外部修改');

      // 外部只改了标题：以旧基线改截止日不冲突，标题保持外部修改
      await details.saveTaskFields(task.id, base, { dueDate: '2026-12-01' });
      const saved = await taskOf(task.id);
      expect(saved.title).toBe('外部修改');
      expect(saved.dueDate).toBe('2026-12-01');
    });

    it('标签冲突与校验沿用一次保存的语义', async () => {
      const { task } = await seedTask();
      const label = await labels.createLabel({ name: '核心', color: '#e11d48' });
      const base = await details.openSnapshot(task.id);
      await details.saveTaskFields(task.id, base, { labelIds: [label.id] });
      await expect(details.saveTaskFields(task.id, base, { labelIds: [] })).rejects.toMatchObject({
        code: 'labels_changed'
      });
      await expect(
        details.saveTaskFields(task.id, await details.openSnapshot(task.id), { title: '  ' })
      ).rejects.toMatchObject({ code: 'empty_title' });
    });

    it('恢复中写门禁', async () => {
      const { task } = await seedTask();
      const base = await details.openSnapshot(task.id);
      ctx.restoring = true;
      await expect(details.saveTaskFields(task.id, base, { title: '改' })).rejects.toMatchObject({
        code: 'restore_in_progress'
      });
    });
  });

  async function firstUndoCount(): Promise<number> {
    return firstValueFrom(rxdb.versionManager.history().undoCount$);
  }

  /** 轮询等待 redo 栈达到期望数量（失效经 detached 事件任务异步落定）。 */
  async function waitForRedoCount(expected: number, timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    for (;;) {
      if ((await firstValueFrom(rxdb.versionManager.history().redoCount$)) === expected) return;
      if (Date.now() - start > timeoutMs) throw new Error(`redo 栈未在 ${timeoutMs}ms 内达到 ${expected}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
});
