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
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BoardShell from '../board-shell.vue';

/**
 * BoardShell 组件（Vue 外壳）：真实 PGlite 上的启动选择、演示数据、重置确认与失败提示，
 * 与 Angular / React 同名用例同组验收语义。编排分支在核心包 BoardShellController 的单测；
 * sqlite-wasm 上的真实恢复闭环在三端宿主与 demo 的 e2e。
 */
describe('BoardShell（Vue 外壳）', () => {
  const opened: RxDB[] = [];
  const mounted: VueWrapper[] = [];

  const memoryRuntime = (seed: Record<string, string> = {}): BoardShellRuntime => {
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

  const mountShell = (overrides: Partial<BoardShellOptions> = {}) => {
    const options: BoardShellOptions = {
      createRxdb,
      adapterName: 'pglite',
      seed: seedReleaseBoardDataset,
      runtime: memoryRuntime(),
      ...overrides
    };
    const wrapper = mount(BoardShell, { props: { options }, attachTo: document.body });
    mounted.push(wrapper);
    const $ = (testId: string) => wrapper.find(`[data-testid="${testId}"]`);
    const $$ = (testId: string) => wrapper.findAll(`[data-testid="${testId}"]`);
    return { wrapper, $, $$ };
  };

  const chooseFile = async (input: ReturnType<ReturnType<typeof mountShell>['$']>): Promise<void> => {
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'board.rxdb')], configurable: true });
    await input.trigger('change');
  };

  afterEach(async () => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    vi.unstubAllGlobals();
    for (const db of opened.splice(0)) await db.disconnectAll().catch(() => undefined);
  });

  it('启动选择：三个入口；新建空看板进入看板阶段，工具栏有重置与恢复', async () => {
    const { $ } = mountShell();
    await vi.waitFor(() => expect($('startup-page').exists()).toBe(true));
    expect($('start-seed').exists()).toBe(true);
    expect($('start-restore').exists()).toBe(true);
    expect(opened).toHaveLength(0);

    await $('start-empty').trigger('click');
    await vi.waitFor(() => expect($('empty-board').exists()).toBe(true), { timeout: 8000 });
    expect($('reset-demo').exists()).toBe(true);
    expect($('restore-open').exists()).toBe(true);
  });

  it('装载演示数据后重置：确认框聚焦取消、Esc 取消、Tab 不离开对话框；确认后切到新库', async () => {
    const { $, $$ } = mountShell();
    await vi.waitFor(() => expect($('start-seed').exists()).toBe(true));
    await $('start-seed').trigger('click');
    await vi.waitFor(() => expect($$('task-card')).toHaveLength(12), { timeout: 8000 });

    ($('reset-demo').element as HTMLElement).focus();
    await $('reset-demo').trigger('click');
    await vi.waitFor(() => expect(document.activeElement).toBe($('host-confirm-no').element));
    ($('host-confirm-yes').element as HTMLElement).focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    $('host-confirm-yes').element.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($('host-confirm-no').element);
    await $('host-confirm-no').trigger('keydown', { key: 'Enter' });
    await $('host-confirm-no').trigger('keydown', { key: 'Escape' });
    await vi.waitFor(() => expect($('host-confirm').exists()).toBe(false));
    await flushPromises();
    expect(document.activeElement).toBe($('reset-demo').element);
    const before = opened.length;

    await $('reset-demo').trigger('click');
    await vi.waitFor(() => expect($('host-confirm-yes').exists()).toBe(true));
    await $('host-confirm-yes').trigger('click');
    await vi.waitFor(() => expect(opened.length).toBe(before + 1), { timeout: 8000 });
    await vi.waitFor(() => expect($$('task-card')).toHaveLength(12), { timeout: 8000 });
    expect(opened.at(-1)?.config.dbName).toBe('rxdb-board-restore-1@0_1');
  });

  it('从备份恢复：已有看板先确认；适配器不支持恢复时如实报错、原看板留着', async () => {
    const { $ } = mountShell();
    await vi.waitFor(() => expect($('start-empty').exists()).toBe(true));
    await $('start-empty').trigger('click');
    await vi.waitFor(() => expect($('empty-board').exists()).toBe(true), { timeout: 8000 });

    // 没选文件（用户取消选择）：什么都不做
    await $('restore-file-menu').trigger('change');
    expect($('host-confirm').exists()).toBe(false);
    await chooseFile($('restore-file-menu'));
    await vi.waitFor(() => expect($('host-confirm-yes').exists()).toBe(true));
    await $('host-confirm-yes').trigger('click');
    await vi.waitFor(() => expect($('app-error').text()).toContain('不支持备份与恢复'));
    expect($('board-view').exists()).toBe(true);
  });

  it('启动页恢复失败：留在启动选择并显示原因；没有演示数据时不显示演示入口', async () => {
    const { $ } = mountShell({ seed: undefined });
    await vi.waitFor(() => expect($('startup-page').exists()).toBe(true));
    expect($('start-seed').exists()).toBe(false);
    await chooseFile($('restore-file'));
    await vi.waitFor(() => expect($('app-error').exists()).toBe(true));
    expect($('startup-page').exists()).toBe(true);

    await $('start-empty').trigger('click');
    await vi.waitFor(() => expect($('board-tools').exists()).toBe(true), { timeout: 8000 });
    expect($('reset-demo').exists()).toBe(false);
  });

  it('另一页面在恢复：显示恢复中；重载后的读回窗口显示切换中', async () => {
    const restoring = mountShell({
      runtime: { ...memoryRuntime({ [RESTORING_MARKER_KEY]: '1' }), withLock: () => new Promise(() => undefined) }
    });
    await vi.waitFor(() => expect(restoring.$('restoring-page').text()).toContain('恢复中：全部写入口已暂停。'));

    const hanging = {
      config: { dbName: 'rxdb-board-restore-0@0_1' },
      connect: () => new Promise(() => undefined),
      disconnectAll: async () => undefined
    } as unknown as RxDB;
    const switching = mountShell({
      createRxdb: () => hanging,
      runtime: {
        ...memoryRuntime({ [PENDING_SWITCH_KEY]: 'rxdb-board-restore-0' }),
        listDatabases: async () => ['rxdb-board-restore-0']
      }
    });
    await vi.waitFor(() => expect(switching.$('restoring-page').text()).toContain('正在打开恢复的看板…'));
  });

  it('拆除：断开当前看板；断开失败只记录', async () => {
    const { wrapper, $ } = mountShell();
    await vi.waitFor(() => expect($('start-empty').exists()).toBe(true));
    await $('start-empty').trigger('click');
    await vi.waitFor(() => expect($('empty-board').exists()).toBe(true), { timeout: 8000 });
    const disconnect = vi.spyOn(opened[0], 'disconnectAll').mockRejectedValueOnce(new Error('断开失败'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mounted.splice(mounted.indexOf(wrapper), 1);
    wrapper.unmount();
    await vi.waitFor(() => expect(logged).toHaveBeenCalledWith('[board-shell] 断开看板失败', expect.any(Error)));
    expect(disconnect).toHaveBeenCalled();
    logged.mockRestore();
  });
});
