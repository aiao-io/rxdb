import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import {
  Board,
  BoardLabel,
  Column,
  PENDING_SWITCH_KEY,
  RESTORING_MARKER_KEY,
  Task,
  TaskLabel,
  type BoardShellOptions,
  type BoardShellRuntime
} from '@aiao/rxdb-plugin-board';
import { seedReleaseBoardDataset } from '@aiao/rxdb-plugin-board/testing';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardShellComponent } from '../board-shell.js';

/**
 * BoardShell 组件（Angular 外壳）：真实 PGlite 上的启动选择、演示数据、重置确认与失败提示。
 * 编排分支在核心包 BoardShellController 的单测；sqlite-wasm 上的真实恢复闭环在三端宿主与 demo 的 e2e。
 */
describe('BoardShellComponent（Angular 外壳）', () => {
  const opened: RxDB[] = [];

  const memoryRuntime = (seed: Record<string, string> = {}): BoardShellRuntime & { reload: () => void } => {
    const data = new Map(Object.entries(seed));
    return {
      storage: {
        get: key => data.get(key) ?? null,
        set: (key, value) => void data.set(key, value),
        remove: key => void data.delete(key)
      },
      withLock: operation => operation(),
      listDatabases: async () => opened.map(db => db.config.dbName.split('@')[0]),
      watchStorage: () => () => undefined,
      reload: vi.fn(),
      download: vi.fn()
    };
  };

  const createRxdb = (dbName: string): RxDB => {
    const db = new RxDB({
      dbName,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None },
      multiInstance: false
    });
    db.use(rxDBPluginHistory);
    db.adapter('pglite', rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    opened.push(db);
    return db;
  };

  const waitFor = async (fixture: ComponentFixture<unknown>, probe: () => boolean, label: string): Promise<void> => {
    const start = Date.now();
    while (!probe()) {
      if (Date.now() - start > 8000) throw new Error(`等待超时：${label}`);
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    fixture.detectChanges();
  };

  const mount = (options: Partial<BoardShellOptions> = {}) => {
    const fixture = TestBed.createComponent(BoardShellComponent);
    fixture.componentRef.setInput('options', {
      createRxdb,
      adapterName: 'pglite',
      seed: seedReleaseBoardDataset,
      runtime: memoryRuntime(),
      ...options
    } satisfies BoardShellOptions);
    fixture.detectChanges();
    const $ = (testId: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
    const $$ = (testId: string) => [...fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)];
    return { fixture, $, $$ };
  };

  afterEach(async () => {
    TestBed.resetTestingModule();
    for (const db of opened.splice(0)) await db.disconnectAll().catch(() => undefined);
  });

  it('启动选择：三个入口；新建空看板进入看板阶段，工具栏有重置与恢复', async () => {
    const { fixture, $ } = mount();
    await waitFor(fixture, () => $('startup-page') !== null, '启动选择');
    expect($('start-empty')).not.toBeNull();
    expect($('start-seed')).not.toBeNull();
    expect($('start-restore')).not.toBeNull();
    expect(opened).toHaveLength(0);

    $('start-empty')!.click();
    await waitFor(fixture, () => $('empty-board') !== null, '空看板');
    expect($('reset-demo')).not.toBeNull();
    expect($('restore-open')).not.toBeNull();
    expect($('board-view')).not.toBeNull();
  });

  it('装载演示数据后重置：确认框聚焦取消、Esc 取消、Tab 不离开对话框；确认后切到新库', { timeout: 15000 }, async () => {
    const { fixture, $, $$ } = mount();
    await waitFor(fixture, () => $('start-seed') !== null, '启动选择');
    $('start-seed')!.click();
    await waitFor(fixture, () => $$('task-card').length === 12, '种子渲染');
    const first = opened[0];

    $('reset-demo')!.focus();
    $('reset-demo')!.click();
    await waitFor(fixture, () => $('host-confirm') !== null, '确认框');
    await new Promise(resolve => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe($('host-confirm-no'));
    $('host-confirm-yes')!.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    $('host-confirm-yes')!.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($('host-confirm-no'));
    $('host-confirm-no')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    $('host-confirm-no')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(fixture, () => $('host-confirm') === null, '取消确认');
    expect(document.activeElement).toBe($('reset-demo'));
    expect(opened).toHaveLength(1);

    $('reset-demo')!.click();
    await waitFor(fixture, () => $('host-confirm-yes') !== null, '再次确认');
    $('host-confirm-yes')!.click();
    await waitFor(fixture, () => opened.length === 2 && $$('task-card').length === 12, '新库种子');
    expect(opened[1].config.dbName).toBe('rxdb-board-restore-1@0_1');
    expect(first).not.toBe(opened[1]);
  });

  it('从备份恢复：已有看板先确认；适配器不支持恢复时如实报错、原看板留着', async () => {
    const { fixture, $ } = mount();
    await waitFor(fixture, () => $('start-empty') !== null, '启动选择');
    $('start-empty')!.click();
    await waitFor(fixture, () => $('empty-board') !== null, '空看板');

    const fileInput = $('restore-file-menu') as HTMLInputElement;
    // 没选文件（用户取消选择）：什么都不做
    fileInput.dispatchEvent(new Event('change'));
    expect($('host-confirm')).toBeNull();
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'board.rxdb')], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await waitFor(fixture, () => $('host-confirm-yes') !== null, '恢复确认');
    $('host-confirm-yes')!.click();
    await waitFor(fixture, () => $('app-error') !== null, '恢复失败提示');
    expect($('app-error')!.textContent).toContain('不支持备份与恢复');
    expect($('board-view')).not.toBeNull();
  });

  it('启动页恢复失败：留在启动选择并显示原因；没有演示数据时不显示演示入口', async () => {
    const { fixture, $ } = mount({ seed: undefined });
    await waitFor(fixture, () => $('startup-page') !== null, '启动选择');
    expect($('start-seed')).toBeNull();
    const fileInput = $('restore-file') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'board.rxdb')], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await waitFor(fixture, () => $('app-error') !== null, '恢复失败提示');
    expect($('startup-page')).not.toBeNull();

    $('start-empty')!.click();
    await waitFor(fixture, () => $('board-tools') !== null, '看板阶段');
    expect($('reset-demo')).toBeNull();
  });

  it('另一页面在恢复：显示恢复中；重载后的读回窗口显示切换中', async () => {
    const restoring = mount({
      runtime: { ...memoryRuntime({ [RESTORING_MARKER_KEY]: '1' }), withLock: () => new Promise(() => undefined) }
    });
    await waitFor(restoring.fixture, () => restoring.$('restoring-page') !== null, '恢复中');
    expect(restoring.$('restoring-page')!.textContent).toContain('恢复中：全部写入口已暂停。');

    const hanging = {
      config: { dbName: 'rxdb-board-restore-0@0_1' },
      connect: () => new Promise(() => undefined),
      disconnectAll: async () => undefined
    } as unknown as RxDB;
    const switching = mount({
      createRxdb: () => hanging,
      runtime: {
        ...memoryRuntime({ [PENDING_SWITCH_KEY]: 'rxdb-board-restore-0' }),
        listDatabases: async () => ['rxdb-board-restore-0']
      }
    });
    await waitFor(switching.fixture, () => switching.$('restoring-page') !== null, '切换中');
    expect(switching.$('restoring-page')!.textContent).toContain('正在打开恢复的看板…');
  });

  it('拆除：断开当前看板；断开失败只记录', async () => {
    const { fixture, $ } = mount();
    await waitFor(fixture, () => $('start-empty') !== null, '启动选择');
    $('start-empty')!.click();
    await waitFor(fixture, () => $('empty-board') !== null, '空看板');
    const db = opened[0];
    const disconnect = vi.spyOn(db, 'disconnectAll').mockRejectedValueOnce(new Error('断开失败'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.destroy();
    await waitFor(
      { detectChanges: () => undefined } as ComponentFixture<unknown>,
      () => logged.mock.calls.length > 0,
      '记录'
    );
    expect(disconnect).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith('[board-shell] 断开看板失败', expect.any(Error));
  });
});
