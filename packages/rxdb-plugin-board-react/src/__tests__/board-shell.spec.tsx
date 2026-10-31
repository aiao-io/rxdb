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
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardShell } from '../board-shell.js';
import { allByTestId, byTestId, memoryStorage } from './board-test-utils.js';

/**
 * BoardShell 组件（React 外壳）：真实 PGlite 上的启动选择、演示数据、重置确认与失败提示，
 * 与 Angular / Vue 同名用例同组验收语义。编排分支在核心包 BoardShellController 的单测；
 * sqlite-wasm 上的真实恢复闭环在三端宿主与 demo 的 e2e。
 */
describe('BoardShell（React 外壳）', () => {
  const opened: RxDB[] = [];

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

  const optionsWith = (overrides: Partial<BoardShellOptions> = {}): BoardShellOptions => ({
    createRxdb,
    adapterName: 'pglite',
    seed: seedReleaseBoardDataset,
    runtime: memoryRuntime(),
    ...overrides
  });

  const query = (testId: string): HTMLElement | null => document.querySelector(`[data-testid="${testId}"]`);

  const chooseFile = (testId: string): void => {
    const fileInput = byTestId(testId) as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'board.rxdb')], configurable: true });
    fireEvent.change(fileInput);
  };

  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    for (const db of opened.splice(0)) await db.disconnectAll().catch(() => undefined);
  });

  it('启动选择：三个入口；新建空看板进入看板阶段，工具栏有重置与恢复', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    render(<BoardShell options={optionsWith()} />);
    await waitFor(() => expect(query('startup-page')).not.toBeNull());
    expect(query('start-seed')).not.toBeNull();
    expect(query('start-restore')).not.toBeNull();
    expect(opened).toHaveLength(0);

    fireEvent.click(byTestId('start-empty'));
    await waitFor(() => expect(query('empty-board')).not.toBeNull(), { timeout: 8000 });
    expect(query('reset-demo')).not.toBeNull();
    expect(query('restore-open')).not.toBeNull();
  });

  it('装载演示数据后重置：确认框聚焦取消、Esc 取消、Tab 不离开对话框；确认后切到新库', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const options = optionsWith();
    render(
      <StrictMode>
        <BoardShell options={options} />
      </StrictMode>
    );
    await waitFor(() => expect(query('start-seed')).not.toBeNull());
    fireEvent.click(byTestId('start-seed'));
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12), { timeout: 8000 });

    byTestId('reset-demo').focus();
    fireEvent.click(byTestId('reset-demo'));
    await waitFor(() => expect(document.activeElement).toBe(query('host-confirm-no')));
    byTestId('host-confirm-yes').focus();
    const tab = fireEvent.keyDown(byTestId('host-confirm-yes'), { key: 'Tab' });
    expect(tab).toBe(false);
    expect(document.activeElement).toBe(query('host-confirm-no'));
    fireEvent.keyDown(byTestId('host-confirm-no'), { key: 'Enter' });
    fireEvent.keyDown(byTestId('host-confirm-no'), { key: 'Escape' });
    await waitFor(() => expect(query('host-confirm')).toBeNull());
    expect(document.activeElement).toBe(query('reset-demo'));
    const before = opened.length;

    fireEvent.click(byTestId('reset-demo'));
    await waitFor(() => expect(query('host-confirm-yes')).not.toBeNull());
    fireEvent.click(byTestId('host-confirm-yes'));
    await waitFor(() => expect(opened.length).toBe(before + 1), { timeout: 8000 });
    await waitFor(() => expect(allByTestId('task-card')).toHaveLength(12), { timeout: 8000 });
    expect(opened.at(-1)?.config.dbName).toBe('rxdb-board-restore-1@0_1');
  });

  it('从备份恢复：已有看板先确认；适配器不支持恢复时如实报错、原看板留着', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    render(<BoardShell options={optionsWith()} />);
    await waitFor(() => expect(query('start-empty')).not.toBeNull());
    fireEvent.click(byTestId('start-empty'));
    await waitFor(() => expect(query('empty-board')).not.toBeNull(), { timeout: 8000 });

    // 没选文件（用户取消选择）：什么都不做
    fireEvent.change(byTestId('restore-file-menu'));
    expect(query('host-confirm')).toBeNull();
    chooseFile('restore-file-menu');
    await waitFor(() => expect(query('host-confirm-yes')).not.toBeNull());
    fireEvent.click(byTestId('host-confirm-yes'));
    await waitFor(() => expect(query('app-error')?.textContent).toContain('不支持备份与恢复'));
    expect(query('board-view')).not.toBeNull();
  });

  it('启动页恢复失败：留在启动选择并显示原因；没有演示数据时不显示演示入口', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    render(<BoardShell options={optionsWith({ seed: undefined })} />);
    await waitFor(() => expect(query('startup-page')).not.toBeNull());
    expect(query('start-seed')).toBeNull();
    chooseFile('restore-file');
    await waitFor(() => expect(query('app-error')).not.toBeNull());
    expect(query('startup-page')).not.toBeNull();

    fireEvent.click(byTestId('start-empty'));
    await waitFor(() => expect(query('board-tools')).not.toBeNull(), { timeout: 8000 });
    expect(query('reset-demo')).toBeNull();
  });

  it('另一页面在恢复：显示恢复中；重载后的读回窗口显示切换中', async () => {
    const restoring = render(
      <BoardShell
        options={optionsWith({
          runtime: { ...memoryRuntime({ [RESTORING_MARKER_KEY]: '1' }), withLock: () => new Promise(() => undefined) }
        })}
      />
    );
    await waitFor(() => expect(query('restoring-page')?.textContent).toContain('恢复中：全部写入口已暂停。'));
    restoring.unmount();

    const hanging = {
      config: { dbName: 'rxdb-board-restore-0@0_1' },
      connect: () => new Promise(() => undefined),
      disconnectAll: async () => undefined
    } as unknown as RxDB;
    render(
      <BoardShell
        options={optionsWith({
          createRxdb: () => hanging,
          runtime: {
            ...memoryRuntime({ [PENDING_SWITCH_KEY]: 'rxdb-board-restore-0' }),
            listDatabases: async () => ['rxdb-board-restore-0']
          }
        })}
      />
    );
    await waitFor(() => expect(query('restoring-page')?.textContent).toContain('正在打开恢复的看板…'));
  });

  it('拆除：断开当前看板；断开失败只记录', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const view = render(<BoardShell options={optionsWith()} />);
    await waitFor(() => expect(query('start-empty')).not.toBeNull());
    fireEvent.click(byTestId('start-empty'));
    await waitFor(() => expect(query('empty-board')).not.toBeNull(), { timeout: 8000 });
    const disconnect = vi.spyOn(opened[0], 'disconnectAll').mockRejectedValueOnce(new Error('断开失败'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    view.unmount();
    await waitFor(() => expect(logged).toHaveBeenCalledWith('[board-shell] 断开看板失败', expect.any(Error)));
    expect(disconnect).toHaveBeenCalled();
    logged.mockRestore();
  });
});
