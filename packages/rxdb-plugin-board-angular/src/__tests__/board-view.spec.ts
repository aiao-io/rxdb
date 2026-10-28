import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardViewComponent } from '../board-view.js';

/**
 * BoardView 组件（看板 v2 的 Angular 半边）：真实 PGlite + 历史插件上的渲染与交互闭环。
 * 真实拖拽、axe 与跨页恢复在 demo e2e。
 */
describe('BoardViewComponent（Angular 视图，看板 v2）', () => {
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

  const $ = (fixture: ComponentFixture<BoardViewComponent>, selector: string) =>
    fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const $$ = (fixture: ComponentFixture<BoardViewComponent>, selector: string) =>
    [...fixture.nativeElement.querySelectorAll(selector)] as HTMLElement[];
  const texts = (fixture: ComponentFixture<BoardViewComponent>, selector: string) =>
    $$(fixture, selector).map(element => element.textContent?.trim());

  const type = (element: HTMLElement | null, value: string, key?: string) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    if (key) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };

  beforeEach(async () => {
    window.prompt = vi.fn(() => null);
    window.confirm = vi.fn(() => false);
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
    // 看板 v2 不再使用浏览器原生弹窗
    expect(window.prompt).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
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

  const mountSeeded = async () => {
    await seedReleaseBoardDataset(rxdb);
    const fixture = await mount();
    await waitFor(fixture, () => $$(fixture, '[data-testid="task-card"]').length === 12, '十二任务');
    return fixture;
  };

  it('空库渲染空态；种子渲染板 / 列 / 任务，标签在标签对话框里', async () => {
    const empty = await mount();
    await waitFor(empty, () => $(empty, '[data-testid="empty-board"]') !== null, '空态');
    empty.destroy();

    const fixture = await mountSeeded();
    expect(texts(fixture, '[data-testid="column-title"]')).toEqual(['To do', 'Doing', 'Done', 'Ideas']);
    expect(texts(fixture, '[data-testid="column-count"]')).toEqual(['5', '4', '3', '0']);
    const root = $(fixture, '[data-testid="board-view"]')!;
    expect(root.classList.contains('has-overlay')).toBe(false);
    $(fixture, '[data-testid="labels-open"]')!.click();
    fixture.detectChanges();
    // 对话框打开时根节点挂 has-overlay：错误提示浮到遮罩之上
    expect(root.classList.contains('has-overlay')).toBe(true);
    expect(texts(fixture, '[data-testid="label-chip"]')).toEqual(['核心', '文档', '测试', '发布']);
    fixture.destroy();
  });

  it('新建看板 / 列 / 任务全程就地输入；建任务后输入框保持打开以便连续录入', async () => {
    const fixture = await mount();
    await waitFor(fixture, () => $(fixture, '[data-testid="create-board-empty"]') !== null, '空态');
    $(fixture, '[data-testid="create-board-empty"]')!.click();
    fixture.detectChanges();
    type($(fixture, '[data-testid="board-composer-input"]'), '看板 A', 'Enter');
    await waitFor(fixture, () => $(fixture, '[data-testid="create-column"]') !== null, '建板并选中');
    expect(($(fixture, '[data-testid="rename-board"]')?.textContent ?? '').trim()).toBe('看板 A');

    $(fixture, '[data-testid="create-column"]')!.click();
    fixture.detectChanges();
    type($(fixture, '[data-testid="column-composer-input"]'), 'C1', 'Enter');
    await waitFor(fixture, () => $(fixture, '[data-testid="column"]') !== null, '建列');

    $(fixture, '[data-testid="add-task"]')!.click();
    fixture.detectChanges();
    type($(fixture, '[data-testid="add-task-input"]'), '任务 1', 'Enter');
    await waitFor(fixture, () => $$(fixture, '[data-testid="task-card"]').length === 1, '建任务');
    type($(fixture, '[data-testid="add-task-input"]'), '任务 2', 'Enter');
    await waitFor(fixture, () => $$(fixture, '[data-testid="task-card"]').length === 2, '连续建任务');
    expect(texts(fixture, '[data-testid="task-title"]')).toEqual(['任务 1', '任务 2']);
    fixture.destroy();
  });

  it('详情即改即存：标题 / 截止日 / 标签各成一个事务，可逐次撤销', async () => {
    const fixture = await mountSeeded();
    const view = fixture.componentInstance;
    const card = () =>
      $$(fixture, '[data-testid="task-card"]').find(element => element.textContent?.includes('写发布说明'))!;
    card().querySelector<HTMLElement>('[data-testid="task-title"]')!.click();
    await waitFor(fixture, () => $(fixture, '[data-testid="detail-panel"]') !== null, '打开详情');
    expect($(fixture, '[data-testid="board-view"]')!.classList.contains('has-overlay')).toBe(true);

    type($(fixture, '[data-testid="detail-title"]'), '写发布说明 v2', 'Enter');
    await waitFor(fixture, () => card()?.textContent?.includes('写发布说明 v2') ?? false, '标题落库');
    const due = $(fixture, '[data-testid="detail-due"]') as HTMLInputElement;
    due.value = '2026-12-31';
    due.dispatchEvent(new Event('change'));
    await waitFor(fixture, () => card()?.querySelector('[data-testid="task-due"]') !== null, '截止日落库');
    await view['openDetailLabelPicker']({
      currentTarget: $(fixture, '[data-testid="detail-labels"]')
    } as unknown as Event);
    fixture.detectChanges();
    expect($(fixture, '.rxb-popover [role="listbox"]')?.getAttribute('aria-label')).toBe('选择标签');
    // listbox 只容 option：无匹配时不渲染 listbox，空态段落在其外
    view['onPickerInput']('不存在的标签');
    fixture.detectChanges();
    expect($(fixture, '.rxb-popover [role="listbox"]')).toBeNull();
    expect($(fixture, '.rxb-picker-empty')?.textContent?.trim()).toBe('没有匹配的选项');
    view['onPickerInput']('');
    const core = view['pickerOptions']().find(option => option.label === '核心')!;
    await view['choosePickerOption'](core.id);
    view['closePopover']();
    await waitFor(fixture, () => card()?.querySelectorAll('[data-testid="card-label"]').length === 2, '标签落库');

    const history = rxdb.versionManager.history();
    await waitFor(fixture, () => view['boardRef'].undoCount() >= 3, '三个事务');
    await history.undo();
    await waitFor(fixture, () => card()?.querySelectorAll('[data-testid="card-label"]').length === 1, '撤销标签');
    await history.undo();
    await waitFor(fixture, () => card()?.querySelector('[data-testid="task-due"]') === null, '撤销截止日');
    expect(card().textContent).toContain('写发布说明 v2');

    // 关提示不抢焦点：空标题被领域拒绝后，按下关闭按钮不改焦点，编辑中的字段不会失焦重提交
    type($(fixture, '[data-testid="detail-title"]'), '   ', 'Enter');
    await waitFor(fixture, () => $(fixture, '[data-testid="board-notice"]') !== null, '空标题被拒');
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    $(fixture, '[data-testid="board-notice-close"]')!.dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    fixture.destroy();
  });

  it('筛选条：标签 / 截止日组合，点击卡片标签切换，计数按结果重算', async () => {
    const fixture = await mountSeeded();
    type($(fixture, '[data-testid="board-filter-input"]'), 'label:核心');
    fixture.detectChanges();
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(4);
    expect(texts(fixture, '[data-testid="column-count"]')).toEqual(['2', '2', '0', '0']);
    expect(($(fixture, '[data-testid="board-filter-count"]')?.textContent ?? '').trim()).toBe('4 项');

    type($(fixture, '[data-testid="board-filter-input"]'), 'label:核心 due:none');
    fixture.detectChanges();
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(0);
    expect(texts(fixture, '[data-testid="column-empty"]')).toContain('没有匹配筛选的任务');

    $(fixture, '[data-testid="board-filter-clear"]')!.click();
    fixture.detectChanges();
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(12);
    const docLabel = $$(fixture, '[data-testid="card-label"]').find(element => element.textContent?.trim() === '文档')!;
    docLabel.click();
    fixture.detectChanges();
    expect(($(fixture, '[data-testid="board-filter-input"]') as HTMLInputElement).value).toBe('label:文档');
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(2);
    fixture.destroy();
  });

  it('删除确认：取消零写；确认级联删除并给出可撤销提示', async () => {
    const fixture = await mountSeeded();
    const view = fixture.componentInstance;
    const doing = view['boardRef'].columns().find(column => column.title === 'Doing')!;
    await view['confirmColumnDelete'](doing);
    fixture.detectChanges();
    expect($(fixture, '[data-testid="confirm-delete"]')?.textContent).toContain('4 个任务');
    $(fixture, '[data-testid="confirm-delete-no"]')!.click();
    fixture.detectChanges();
    expect($$(fixture, '[data-testid="column"]')).toHaveLength(4);

    await view['confirmColumnDelete'](doing);
    fixture.detectChanges();
    $(fixture, '[data-testid="confirm-delete-yes"]')!.click();
    await waitFor(fixture, () => $$(fixture, '[data-testid="column"]').length === 3, '删列');
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(8);
    expect($(fixture, '[data-testid="board-toast"]')?.textContent).toContain('已删除列「Doing」');
    $(fixture, '[data-testid="board-toast-undo"]')!.click();
    await waitFor(fixture, () => $$(fixture, '[data-testid="column"]').length === 4, '撤销删列');
    expect($$(fixture, '[data-testid="task-card"]')).toHaveLength(12);
    fixture.destroy();
  });

  it('Alt + 方向键移动卡片并持久化（焦点跟随在 e2e 里验收）', async () => {
    const fixture = await mountSeeded();
    const card = $$(fixture, '[data-testid="task-card"]').find(element => element.textContent?.includes('写发布说明'))!;
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    await waitFor(fixture, () => texts(fixture, '[data-testid="task-title"]')[0] === '写发布说明', '上移');
    const tasks = await firstValueFrom(
      rxdb.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [] } })
    );
    const todo = fixture.componentInstance['boardRef'].columns()[0];
    expect(tasks.filter(task => task.columnId === todo.id).map(task => task.title)[0]).toBe('写发布说明');
    fixture.destroy();
  });

  it('恢复中写入口禁用、浏览可用', async () => {
    const fixture = await mountSeeded();
    fixture.componentInstance['boardRef'].setRestoring(true);
    await waitFor(fixture, () => $(fixture, '[data-testid="restoring-note"]') !== null, '恢复中');
    for (const testId of ['create-board', 'create-column', 'add-task', 'undo']) {
      expect(($(fixture, `[data-testid="${testId}"]`) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(($(fixture, '[data-testid="labels-open"]') as HTMLButtonElement).disabled).toBe(false);
    fixture.destroy();
  });
});
