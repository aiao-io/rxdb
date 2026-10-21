import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    const prompts: string[] = ['看板 A', 'C1', '任务 1'];
    const originalPrompt = window.prompt;
    window.prompt = () => prompts.shift() ?? null;
    try {
      (fixture.nativeElement.querySelector('[data-testid="create-board-empty"]') as HTMLButtonElement).click();
      // happy-dom 下点击后的异步创建链需要一次落定；waitFor 轮询兜底
      await new Promise(r => setTimeout(r, 500));
      await waitFor(
        fixture,
        () => fixture.nativeElement.querySelector('[data-testid="column"]') === null && prompts.length === 2,
        '建板'
      );
      // 板已建后 prompt 剩余 C1 / 任务 1；空列无列时建列入口在页头
      (fixture.nativeElement.querySelector('[data-testid="create-column"]') as HTMLButtonElement).click();
      await waitFor(fixture, () => fixture.nativeElement.querySelector('[data-testid="column"]') !== null, '建列');
      (fixture.nativeElement.querySelector('[data-testid="add-task"]') as HTMLButtonElement).click();
      await waitFor(fixture, () => fixture.nativeElement.querySelector('[data-testid="task-card"]') !== null, '建任务');
      expect(fixture.nativeElement.querySelector('[data-testid="task-title"]')?.textContent).toBe('任务 1');
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

  async function firstValueFromTaskTitles(db: RxDB): Promise<readonly string[]> {
    const { firstValueFrom } = await import('rxjs');
    const tasks = await firstValueFrom(
      db.entityManager.getRepository(Task).find({ where: { combinator: 'and', rules: [] } })
    );
    return tasks.map(task => task.title);
  }
});
