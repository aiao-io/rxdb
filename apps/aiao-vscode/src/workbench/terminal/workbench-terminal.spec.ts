// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchBackend, WorkbenchSnapshot } from '../session.js';
import { WorkbenchSession } from '../session.js';
import type { TerminalRuntimeOptions } from './webcontainer-runtime.js';
import { createWorkbenchTerminal } from './workbench-terminal.js';

const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).forEach(dispose => dispose()));

async function fixture() {
  let snapshot: WorkbenchSnapshot = { projectId: 'one', revision: '1', files: { 'main.js': 'saved' } };
  const backend = {
    open: vi.fn(async (projectId: string) => { snapshot = { ...snapshot, projectId }; return snapshot; }),
    save: vi.fn(async (_id: string, files: WorkbenchSnapshot['files'], _revision: string, removed: readonly string[] = []) => {
      const next = { ...snapshot.files, ...files };
      removed.forEach(path => delete next[path]);
      snapshot = { ...snapshot, revision: String(Number(snapshot.revision) + 1), files: next };
      return snapshot;
    }),
    dispose: vi.fn()
  } as unknown as WorkbenchBackend;
  const session = new WorkbenchSession(backend);
  await session.open('one');
  const host = document.createElement('section');
  const runtime = { start: vi.fn(async (): Promise<void> => undefined), write: vi.fn(async (): Promise<void> => undefined), resize: vi.fn(), sync: vi.fn(async (): Promise<void> => undefined), flush: vi.fn(async (): Promise<void> => undefined), stop: vi.fn<() => Promise<void>>(), dispose: vi.fn() };
  runtime.stop.mockImplementation(async () => { await runtime.flush(); runtime.dispose(); });
  const view = { write: vi.fn(), focus: vi.fn(), fit: vi.fn(), clear: vi.fn(), dispose: vi.fn(), cols: 80, rows: 24 };
  let runtimeOptions: TerminalRuntimeOptions;
  let viewOptions: { onData(data: string): void; onResize(size: { cols: number; rows: number }): void };
  const createRuntime = vi.fn((options: TerminalRuntimeOptions) => { runtimeOptions = options; return runtime; });
  const createView = vi.fn(async (_host: HTMLElement, options: typeof viewOptions) => { viewOptions = options; return view; });
  const onPreview = vi.fn();
  const onStop = vi.fn();
  const onError = vi.fn();
  const terminal = createWorkbenchTerminal(host, { session, createRuntime, createView, onPreview, onStop, onError });
  disposers.push(() => { terminal.dispose(); session.dispose(); host.remove(); });
  return { session, host, terminal, runtime, view, createRuntime, createView, onPreview, onStop, onError, get runtimeOptions() { return runtimeOptions!; }, get viewOptions() { return viewOptions!; } };
}

describe('工作台交互终端', () => {
  it('仅在打开时启动，并只挂载已保存文件；输入输出与尺寸连接真实进程接口', async () => {
    const f = await fixture();
    f.session.edit('main.js', 'draft');
    expect(f.createRuntime).not.toHaveBeenCalled();
    await Promise.all([f.terminal.show(), f.terminal.show()]);
    expect(f.createRuntime).toHaveBeenCalledTimes(1);
    expect(f.runtime.start).toHaveBeenCalledWith({ projectId: 'one', revision: '1', files: { 'main.js': 'saved' } }, { cols: 80, rows: 24 });
    f.viewOptions.onData('node --version\r');
    f.runtimeOptions.onOutput('v22.0.0\r\n');
    f.viewOptions.onResize({ cols: 100, rows: 30 });
    expect(f.runtime.write).toHaveBeenCalledWith('node --version\r');
    expect(f.view.write).toHaveBeenCalledWith('v22.0.0\r\n');
    expect(f.runtime.resize).toHaveBeenCalledWith({ cols: 100, rows: 30 });
  });

  it('终端写回不覆盖未保存缓冲，编辑器保存后再同步到终端', async () => {
    const f = await fixture();
    await f.terminal.show();
    f.session.edit('main.js', 'draft');
    expect(f.runtime.sync).not.toHaveBeenCalled();
    await f.runtimeOptions.onFiles({ 'main.js': 'from terminal', 'new.js': 'new' }, []);
    expect(f.session.state.files['main.js']).toBe('draft');
    expect(f.session.state.files['new.js']).toBe('new');
    expect(f.session.state.dirty).toBe(true);
    const notice = f.host.querySelector<HTMLElement>('.wb-terminal-message')!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('终端更新了 main.js；编辑器未保存内容已保留');
    await vi.waitFor(() => expect(f.runtime.sync).toHaveBeenCalled());
    expect(notice.hidden).toBe(false);
    await f.session.save();
    await vi.waitFor(() => expect(f.runtime.sync).toHaveBeenLastCalledWith(expect.objectContaining({ files: { 'main.js': 'draft', 'new.js': 'new' } })));
    expect(notice.hidden).toBe(true);
  });

  it('其他路径变更与相同内容不产生编辑冲突提示', async () => {
    const f = await fixture();
    await f.terminal.show();
    f.session.edit('main.js', 'draft');
    await f.runtimeOptions.onFiles({ 'new.js': 'new' }, []);
    const notice = f.host.querySelector<HTMLElement>('.wb-terminal-message')!;
    expect(notice.hidden).toBe(true);
    await f.runtimeOptions.onFiles({ 'main.js': 'draft' }, []);
    expect(f.session.state.dirty).toBe(false);
    expect(notice.hidden).toBe(true);
  });

  it('服务器地址可预览；切换项目释放旧进程并拦截迟到回调', async () => {
    const f = await fixture();
    await f.terminal.show();
    const old = f.runtimeOptions;
    old.onServerReady(5173, 'https://project.webcontainer.io');
    expect(f.onPreview).toHaveBeenCalledWith(5173, 'https://project.webcontainer.io/');
    expect(f.host.textContent).toContain('5173');
    await f.session.open('two');
    expect(f.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(f.view.dispose).toHaveBeenCalledTimes(1);
    old.onOutput('late output');
    old.onServerReady(3000, 'https://old.webcontainer.io');
    await old.onFiles({ 'leak.js': 'no' }, []);
    expect(f.view.write).not.toHaveBeenCalledWith('late output');
    expect(f.session.state.files).not.toHaveProperty('leak.js');
    expect(f.onPreview).toHaveBeenCalledTimes(1);
    expect(f.onStop).toHaveBeenCalled();
  });

  it('拒绝宿主同源和非 HTTP 服务预览，并把启动失败留在面板供重试', async () => {
    const f = await fixture();
    f.runtime.start.mockRejectedValueOnce(new Error('network blocked'));
    await f.terminal.show();
    expect(f.host.textContent).toContain('network blocked');
    expect(f.runtime.dispose).toHaveBeenCalled();
    await f.terminal.show();
    f.runtimeOptions.onServerReady(80, location.origin);
    f.runtimeOptions.onServerReady(80, 'javascript:alert(1)');
    expect(f.onPreview).not.toHaveBeenCalled();
    expect(f.onError).toHaveBeenCalled();
  });

  it('退出后可重启；停止前等待终端更改落盘', async () => {
    const f = await fixture();
    await f.terminal.show();
    f.runtimeOptions.onExit(0);
    expect(f.host.textContent).toContain('已退出');
    await f.terminal.show();
    expect(f.createRuntime).toHaveBeenCalledTimes(2);
    await f.terminal.stop();
    expect(f.runtime.flush).toHaveBeenCalled();
    expect(f.runtime.dispose).toHaveBeenCalled();
  });

  it('旧输入失败不能污染新项目的状态', async () => {
    const f = await fixture();
    await f.terminal.show();
    let rejectInput: (cause: Error) => void = () => undefined;
    f.runtime.write.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectInput = reject; }));
    f.viewOptions.onData('pending');
    await f.session.open('two');
    rejectInput(new Error('old process closed'));
    await Promise.resolve();
    expect(f.onError).not.toHaveBeenCalled();
    expect(f.host.textContent).not.toContain('old process closed');
  });

  it('保存同步失败可在重新连接时重试，同一revision不会并发重复同步', async () => {
    const f = await fixture();
    await f.terminal.show();
    f.runtime.sync.mockRejectedValueOnce(new Error('sync failed'));
    f.session.edit('main.js', 'next saved');
    await f.session.save();
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync failed' })));
    await Promise.all([f.terminal.show(), f.terminal.show()]);
    expect(f.runtime.sync).toHaveBeenCalledTimes(2);
    expect(f.runtime.sync).toHaveBeenLastCalledWith(expect.objectContaining({ revision: '2', files: { 'main.js': 'next saved' } }));
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('运行中');
  });

  it('停止等待写回完成，写回失败时保留运行环境供重试', async () => {
    const f = await fixture();
    await f.terminal.show();
    f.runtime.flush.mockRejectedValueOnce(new Error('disk full'));
    await expect(f.terminal.stop()).rejects.toThrow('disk full');
    expect(f.runtime.dispose).not.toHaveBeenCalled();
    let finish: () => void = () => undefined;
    f.runtime.flush.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const stopped = f.terminal.stop();
    await Promise.resolve();
    expect(f.runtime.dispose).not.toHaveBeenCalled();
    finish();
    await stopped;
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
    f.host.querySelector<HTMLButtonElement>('[data-terminal-action="start"]')?.click();
    await vi.waitFor(() => expect(f.createRuntime).toHaveBeenCalledTimes(2));
    f.host.querySelector<HTMLButtonElement>('[data-terminal-action="clear"]')?.click();
    expect(f.view.clear).toHaveBeenCalledOnce();
  });

  it('停止取消尚未完成的视图加载，迟到释放不会清掉新终端DOM', async () => {
    const f = await fixture();
    let finish: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    f.createView.mockImplementationOnce(async screen => {
      await gate;
      return { ...f.view, dispose: vi.fn(() => { screen.replaceChildren(); }) };
    });
    const first = f.terminal.show();
    await Promise.resolve();
    await f.terminal.stop();
    f.createView.mockImplementationOnce(async screen => {
      screen.textContent = 'new terminal';
      return f.view;
    });
    await f.terminal.show();
    finish();
    await first;
    expect(f.host.textContent).toContain('new terminal');
    expect(f.createRuntime).toHaveBeenCalledOnce();
  });

  it('切换项目时尚未完成的runtime启动不会重新显示运行状态', async () => {
    const f = await fixture();
    let finish: () => void = () => undefined;
    f.runtime.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = f.terminal.show();
    await vi.waitFor(() => expect(f.runtime.start).toHaveBeenCalledOnce());
    await f.session.open('two');
    finish();
    await first;
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('尚未启动');
    expect(f.view.focus).not.toHaveBeenCalled();
    expect(f.runtime.dispose).toHaveBeenCalledOnce();
  });
});
