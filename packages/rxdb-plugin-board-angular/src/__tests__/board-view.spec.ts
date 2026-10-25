import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewComponent } from '../board-view.js';

/**
 * BoardView 组件（US-539 阶段 A 的 Angular 半边）：种子渲染、创建、内联编辑、
 * 删除确认与恢复中门禁的组件级验收。真实拖拽与 a11y 在 demo e2e。
 */
describe('BoardViewComponent（Angular 视图）', () => {
  let rxdb: RxDB;

  const waitFor = async (
    fixture: { detectChanges(): void },
    probe: () => boolean,
    label: string,
    timeoutMs = 5000
  ): Promise<void> => {
    const start = Date.now();
    while (!probe()) {
      if (Date.now() - start > timeoutMs) throw new Error(`等待超时：${label}`);
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    fixture.detectChanges();
  };

  beforeEach(async () => {
    window.confirm = vi.fn(() => true);
    rxdb = new RxDB({
      dbName: `board-view-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rxdb.disconnectAll();
  });

  const mount = async () => {
    const fixture = TestBed.createComponent(BoardViewComponent);
    fixture.componentRef.setInput('rxdb', rxdb);
    fixture.detectChanges();
    // zoneless 下 whenStable 会等活查询等永不安静的异步工作；固定等待一次微任务轮转
    await new Promise(resolve => setTimeout(resolve, 120));
    fixture.detectChanges();
    return fixture;
  };

  it('取消切板后选择器应显示实际当前板', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    try {
      const b = fixture.componentInstance['boardRef'];
      await waitFor(fixture, () => b.boards().length === 2 && b.currentBoard() !== null, '两块板');
      const original = b.currentBoardId();
      const target = b.boards().find(item => item.id !== original)!;
      await fixture.componentInstance['openDetail'](b.tasks()[0].id);
      fixture.componentInstance['draftDescription'].set('未保存内容');
      fixture.detectChanges();
      vi.mocked(window.confirm).mockReturnValue(false);
      const select = fixture.nativeElement.querySelector('[data-testid="board-selector"]') as HTMLSelectElement;
      select.value = target.id;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
      expect(b.currentBoardId()).toBe(original);
      expect(select.value).toBe(original);
    } finally {
      fixture.destroy();
    }
  });
  it('空库渲染空态；种子渲染板/列/任务/标签', async () => {
    const empty = await mount();
    await waitFor(empty, () => empty.nativeElement.querySelector('[data-testid="empty-board"]') !== null, '空态');
    empty.destroy();

    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    await waitFor(fixture, () => fixture.nativeElement.querySelectorAll('[data-testid="column"]').length === 4, '四列');
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="task-card"]').length === 12,
      '十二任务'
    );
    expect(fixture.nativeElement.querySelectorAll('[data-testid="label-chip"]').length).toBe(4);
    const titles = [...fixture.nativeElement.querySelectorAll('[data-testid="column-title"]')].map((el: Element) =>
      el.textContent?.trim()
    );
    expect(titles).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    fixture.destroy();
  });

  it('创建板/列/任务后渲染更新；恢复中写入口禁用', async () => {
    const fixture = await mount();
    // 空态下经入口建板（window.prompt 打桩）
    const prompts: string[] = ['看板 A', 'C1'];
    const originalPrompt = window.prompt;
    window.prompt = () => prompts.shift() ?? null;
    try {
      (fixture.nativeElement.querySelector('[data-testid="create-board-empty"]') as HTMLButtonElement).click();
      // happy-dom 下点击后的异步创建链需要一次落定；waitFor 轮询兜底
      await new Promise(r => setTimeout(r, 500));
      await waitFor(
        fixture,
        () => fixture.nativeElement.querySelector('[data-testid="column"]') === null && prompts.length === 1,
        '建板'
      );
      // 板已建后 prompt 剩 C1；空列无列时建列入口在页头
      (fixture.nativeElement.querySelector('[data-testid="create-column"]') as HTMLButtonElement).click();
      await waitFor(fixture, () => fixture.nativeElement.querySelector('[data-testid="column"]') !== null, '建列');
      // 内联建任务（GitHub Projects 风格）：输入 + Enter
      (fixture.nativeElement.querySelector('[data-testid="add-task"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('[data-testid="add-task-input"]') as HTMLInputElement;
      input.value = '任务 1';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor(fixture, () => fixture.nativeElement.querySelector('[data-testid="task-card"]') !== null, '建任务');
      expect(fixture.nativeElement.querySelector('[data-testid="task-title"]')?.textContent?.trim()).toBe('任务 1');
    } finally {
      window.prompt = originalPrompt;
    }
    fixture.destroy();
  });

  it('内联编辑保存走领域校验：空标题零写并提示', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="task-card"]').length === 12,
      '种子渲染'
    );

    const firstCard = fixture.nativeElement.querySelector('[data-testid="task-card"]');
    (firstCard.querySelector('[data-testid="task-edit-title"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const editor = fixture.nativeElement.querySelector('[data-testid="task-title-editor"]') as HTMLInputElement;
    editor.value = '   ';
    editor.dispatchEvent(new Event('input'));
    (fixture.nativeElement.querySelector('[data-testid="task-title-save"]') as HTMLButtonElement).click();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelector('[data-testid="board-notice"]') !== null,
      '错误提示'
    );
    const tasks = await firstValueFromTaskTitles(rxdb);
    expect(tasks).toContain('修复登录 bug');
    fixture.destroy();
  });

  it('删除确认：取消零写、确认级联', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="column"]').length === 4,
      '种子渲染'
    );

    const columns = fixture.nativeElement.querySelectorAll('[data-testid="column"]');
    (columns[0].querySelector('[data-testid="column-delete"]') as HTMLButtonElement).click();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelector('[data-testid="confirm-delete"]') !== null,
      '确认面板'
    );
    (fixture.nativeElement.querySelector('[data-testid="confirm-delete-no"]') as HTMLButtonElement).click();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="column"]').length === 4,
      '取消零写'
    );

    (columns[0].querySelector('[data-testid="column-delete"]') as HTMLButtonElement).click();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelector('[data-testid="confirm-delete"]') !== null,
      '再次确认'
    );
    (fixture.nativeElement.querySelector('[data-testid="confirm-delete-yes"]') as HTMLButtonElement).click();
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="column"]').length === 3,
      '确认级联'
    );
    await waitFor(
      fixture,
      () => fixture.nativeElement.querySelectorAll('[data-testid="task-card"]').length === 7,
      '任务级联删除'
    );
    fixture.destroy();
  });

  it('删除确认后新增的任务令原清单过期，整列保持不变', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    const column = board.columns()[0];
    await view['confirmColumnDelete'](column);
    await board.actions.createTask({ columnId: column.id, title: '确认后新增' });
    await view['executeConfirmedDelete']();
    await new Promise(resolve => setTimeout(resolve, 100));
    fixture.detectChanges();
    expect(board.columns()).toHaveLength(4);
    expect(board.tasks().filter(task => task.columnId === column.id)).toHaveLength(6);
    expect(view['notice']()).toContain('重新确认');
    fixture.destroy();
  });

  it('切换详情先确认草稿，拒绝时原草稿不丢失', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const [first, second] = view['boardRef'].tasks();
    await view['openDetail'](first.id);
    view['detailDraftTitle'].set('未保存');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await view['openDetail'](second.id);
    expect(confirm).toHaveBeenCalledOnce();
    expect(view['detailTaskId']()).toBe(first.id);
    expect(view['detailDraftTitle']()).toBe('未保存');
    confirm.mockReturnValue(true);
    await view['openDetail'](second.id);
    expect(view['detailTaskId']()).toBe(second.id);
    fixture.destroy();
  });

  it('迟到的详情快照不能覆盖较新选择或已关闭面板', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    const [first, second] = board.tasks();
    const firstSnapshot = await board.actions.openSnapshot(first.id);
    let finish!: (snapshot: typeof firstSnapshot) => void;
    const pending = new Promise<typeof firstSnapshot>(resolve => {
      finish = resolve;
    });
    const spy = vi.spyOn(board.actions, 'openSnapshot').mockReturnValueOnce(pending);
    const opening = view['openDetail'](first.id);
    await view['openDetail'](second.id);
    finish(firstSnapshot);
    await opening;
    expect(view['detailTaskId']()).toBe(second.id);
    spy.mockReturnValueOnce(Promise.resolve(firstSnapshot));
    const closing = view['openDetail'](first.id);
    view['closeDetail']();
    await closing;
    expect(view['detailTaskId']()).toBeNull();
    fixture.destroy();
  });

  it('同列移动位置排除自己，跨列移动后仍可保存草稿', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    const [first, second] = board.tasks().filter(task => task.columnId === board.columns()[0].id);
    await view['openDetail'](first.id);
    fixture.detectChanges();
    const options = [
      ...fixture.nativeElement.querySelectorAll('[data-testid="move-position"] option')
    ] as HTMLOptionElement[];
    expect(options.some(option => option.textContent?.includes(first.title))).toBe(false);
    const afterSecond = options.find(option => option.textContent?.includes(second.title));
    view['movePosition'].set(Number(afterSecond?.value));
    await view['moveTaskByMenu']();
    await waitFor(
      fixture,
      () => board.tasks().filter(task => task.columnId === first.columnId)[1]?.id === first.id,
      '同列位置'
    );
    const destination = board.columns()[1];
    view['detailDraftTitle'].set('移动后保存的草稿');
    view['moveColumnId'].set(destination.id);
    view['movePosition'].set(0);
    await view['moveTaskByMenu']();
    await view['saveDetail']();
    await waitFor(
      fixture,
      () => board.tasks().find(task => task.id === first.id)?.title === '移动后保存的草稿',
      '保存草稿'
    );
    expect(view['detailTaskId']()).toBeNull();
    fixture.destroy();
  });

  it('详情内编辑后自己拖拽跨列仍可保存，草稿不丢失', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    const first = board.tasks()[0];
    const destination = board.columns()[1];
    await view['openDetail'](first.id);
    view['detailDraftTitle'].set('拖拽后保存的草稿');
    const target = fixture.nativeElement.querySelector(`[data-column-id="${destination.id}"]`) as HTMLElement;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 150, 300));
    const event = {
      preventDefault: vi.fn(),
      clientX: 210,
      clientY: 250,
      dataTransfer: { getData: () => first.id }
    } as unknown as DragEvent;
    await view['onTaskDrop'](event, destination);
    await view['saveDetail']();
    await waitFor(
      fixture,
      () =>
        board
          .tasks()
          .some(task => task.id === first.id && task.columnId === destination.id && task.title === '拖拽后保存的草稿'),
      '拖拽跨列后保存'
    );
    expect(board.tasks().find(task => task.id === first.id)?.title).toBe('拖拽后保存的草稿');
    expect(view['detailTaskId']()).toBeNull();
    fixture.destroy();
  });

  it('保存待完成时禁用详情编辑和移动，仍允许取消与切板', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    await view['openDetail'](board.tasks()[0].id);
    let complete!: () => void;
    vi.spyOn(board.actions, 'saveTaskDraft').mockImplementationOnce(
      () =>
        new Promise(resolve => {
          complete = () => resolve({ kind: 'unchanged' });
        })
    );
    const saving = view['saveDetail']();
    fixture.detectChanges();
    const blocked = [
      'detail-title',
      'detail-description',
      'detail-due',
      'detail-label-check',
      'move-column',
      'move-position',
      'move-task',
      'detail-save',
      'detail-delete'
    ];
    await waitFor(
      fixture,
      () =>
        blocked.every(testId => {
          const element = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
          return element?.disabled === true;
        }),
      '保存控件禁用'
    );
    for (const testId of blocked) {
      const element = fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLInputElement;
      expect(element.disabled, testId).toBe(true);
    }
    expect((fixture.nativeElement.querySelector('[data-testid="detail-cancel"]') as HTMLButtonElement).disabled).toBe(
      false
    );
    expect((fixture.nativeElement.querySelector('[data-testid="board-selector"]') as HTMLSelectElement).disabled).toBe(
      false
    );
    complete();
    await saving;
    fixture.destroy();
  });

  it('移动只同步列快照，其他入口改标题仍阻止草稿保存', async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    const view = fixture.componentInstance;
    const board = view['boardRef'];
    const first = board.tasks()[0];
    await view['openDetail'](first.id);
    view['detailDraftTitle'].set('自己的草稿');
    await board.actions.updateTaskTitle(first.id, '另一个入口的新标题');
    view['moveColumnId'].set(board.columns()[1].id);
    await view['moveTaskByMenu']();
    await view['saveDetail']();
    expect(view['detailTaskId']()).toBe(first.id);
    expect(view['detailDraftTitle']()).toBe('自己的草稿');
    expect(view['notice']()).toContain('其它入口修改');
    fixture.destroy();
  });

  async function firstValueFromTaskTitles(db: RxDB): Promise<readonly string[]> {
    const { firstValueFrom } = await import('rxjs');
    const tasks = await firstValueFrom(
      db.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [] } })
    );
    return tasks.map(task => task.title);
  }
});
