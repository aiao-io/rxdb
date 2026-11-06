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
  const runtime = { start: vi.fn(async (): Promise<void> => undefined), write: vi.fn(async (): Promise<void> => undefined), resize: vi.fn(), runProject: vi.fn(async (): Promise<void> => undefined), writeProject: vi.fn(async (): Promise<void> => undefined), resizeProject: vi.fn(), sync: vi.fn(async (): Promise<void> => undefined), flush: vi.fn(async (): Promise<void> => undefined), stop: vi.fn<() => Promise<void>>(), dispose: vi.fn() };
  runtime.stop.mockImplementation(async () => { await runtime.flush(); runtime.dispose(); });
  const view = { write: vi.fn(), focus: vi.fn(), fit: vi.fn(), clear: vi.fn(), dispose: vi.fn(), cols: 80, rows: 24 };
  const views: typeof view[] = [];
  let runtimeOptions: TerminalRuntimeOptions;
  let viewOptions: { onData(data: string): void; onResize(size: { cols: number; rows: number }): void };
  const createRuntime = vi.fn((options: TerminalRuntimeOptions) => { runtimeOptions = options; return runtime; });
  const viewCallbacks: (typeof viewOptions)[] = [];
  const createView = vi.fn(async (_host: HTMLElement, options: typeof viewOptions) => {
    viewOptions = options;
    viewCallbacks.push(options);
    const next = views.length ? { write: vi.fn(), focus: vi.fn(), fit: vi.fn(), clear: vi.fn(), dispose: vi.fn(), cols: 80, rows: 24 } : view;
    views.push(next);
    return next;
  });
  const onPreview = vi.fn();
  const onStop = vi.fn();
  const onError = vi.fn();
  const terminal = createWorkbenchTerminal(host, { session, createRuntime, createView, onPreview, onStop, onError });
  disposers.push(() => { terminal.dispose(); session.dispose(); host.remove(); });
  return { session, host, terminal, runtime, view, views, viewCallbacks, createRuntime, createView, onPreview, onStop, onError, get runtimeOptions() { return runtimeOptions!; }, get viewOptions() { return viewOptions!; } };
}

async function projectFixture() {
  const f = await fixture();
  await f.session.applyExternalFiles({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' }, packageManager: 'pnpm@10.0.0' }) }, []);
  return f;
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

  it('运行项目自动选中独立项目终端，安装输出、交互与 Shell 分离', async () => {
    const f = await projectFixture();
    await f.terminal.runProject();
    expect(f.runtime.runProject).toHaveBeenCalledExactlyOnceWith({ manager: 'pnpm', script: 'dev' });
    expect(f.views).toHaveLength(2);
    const project = f.views[1]!;
    f.runtimeOptions.onProjectState?.('installing');
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('安装依赖');
    f.runtimeOptions.onProjectOutput?.('Packages: +42\r\n');
    expect(project.write).toHaveBeenCalledWith('Packages: +42\r\n');
    expect(f.view.write).not.toHaveBeenCalledWith('Packages: +42\r\n');
    f.viewCallbacks[1]!.onData('\u0003');
    f.viewCallbacks[1]!.onResize({ cols: 110, rows: 32 });
    expect(f.runtime.writeProject).toHaveBeenCalledWith('\u0003');
    expect(f.runtime.resizeProject).toHaveBeenCalledWith({ cols: 110, rows: 32 });
    expect(f.runtime.write).not.toHaveBeenCalled();
    f.runtimeOptions.onProjectState?.('running');
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('项目运行中');
    await f.terminal.show();
    expect(project.focus).toHaveBeenCalled();
    f.host.querySelector<HTMLButtonElement>('[data-terminal-session="shell"]')?.click();
    expect(f.view.focus).toHaveBeenCalled();
    f.viewCallbacks[0]!.onData('pwd\r');
    expect(f.runtime.write).toHaveBeenCalledWith('pwd\r');
  });

  it('重复运行只聚焦现有项目，退出后可再次运行并保留 Shell', async () => {
    const f = await projectFixture();
    await f.terminal.runProject();
    await f.terminal.runProject();
    expect(f.runtime.runProject).toHaveBeenCalledOnce();
    expect(f.views[1]!.clear).not.toHaveBeenCalled();
    f.runtimeOptions.onProjectState?.('stopped', 130);
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('项目已停止 (130)');
    await f.terminal.runProject();
    expect(f.runtime.runProject).toHaveBeenCalledTimes(2);
    expect(f.runtime.start).toHaveBeenCalledOnce();
    expect(f.view.dispose).not.toHaveBeenCalled();
    await f.terminal.stop();
    expect(f.views[1]!.dispose).toHaveBeenCalledOnce();
  });

  it('项目启动等待已经在同步的已保存文件，并追上启动过程中保存的新版本', async () => {
    const f = await projectFixture();
    await f.terminal.show();
    let finish: () => void = () => undefined;
    f.runtime.sync.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    f.session.edit('main.js', 'new saved');
    await f.session.save();
    const running = f.terminal.runProject();
    await vi.waitFor(() => expect(f.createView).toHaveBeenCalledTimes(2));
    expect(f.runtime.runProject).not.toHaveBeenCalled();
    f.session.edit('main.js', 'newest saved');
    await f.session.save();
    finish();
    await running;
    expect(f.runtime.sync).toHaveBeenLastCalledWith(expect.objectContaining({ files: expect.objectContaining({ 'main.js': 'newest saved' }) }));
    expect(f.runtime.runProject).toHaveBeenCalledOnce();
  });

  it('容器启动期间的新保存必须同步后才能运行项目', async () => {
    const f = await projectFixture();
    let finish: () => void = () => undefined;
    f.runtime.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = f.terminal.runProject();
    await vi.waitFor(() => expect(f.runtime.start).toHaveBeenCalledOnce());
    f.session.edit('main.js', 'saved during boot');
    await f.session.save();
    finish();
    await running;
    expect(f.runtime.sync).toHaveBeenCalledWith(expect.objectContaining({ files: expect.objectContaining({ 'main.js': 'saved during boot' }) }));
    expect(f.runtime.runProject).toHaveBeenCalledOnce();
  });

  it('同步失败拒绝启动并把错误留在项目终端', async () => {
    const f = await projectFixture();
    await f.terminal.show();
    let rejectSync: (cause: Error) => void = () => undefined;
    f.runtime.sync.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSync = reject; }));
    f.session.edit('main.js', 'new saved');
    await f.session.save();
    const running = f.terminal.runProject();
    await vi.waitFor(() => expect(f.createView).toHaveBeenCalledTimes(2));
    rejectSync(new Error('sync refused'));
    await expect(running).rejects.toThrow('sync refused');
    expect(f.runtime.runProject).not.toHaveBeenCalled();
    expect(f.views[1]!.write).toHaveBeenCalledWith(expect.stringContaining('sync refused'));
    expect(f.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync refused' }));
  });

  it('项目终端 Ctrl+C 取消等待启动，迟到的容器就绪不会再运行项目', async () => {
    const f = await projectFixture();
    let finish: () => void = () => undefined;
    f.runtime.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = f.terminal.runProject();
    await vi.waitFor(() => expect(f.views).toHaveLength(2));
    f.viewCallbacks[1]!.onData('\u0003');
    finish();
    await running;
    expect(f.runtime.runProject).not.toHaveBeenCalled();
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toContain('项目已停止');
    expect(f.runtime.dispose).not.toHaveBeenCalled();
  });

  it('切换项目拦截等待启动与旧项目输出，并释放两个终端视图', async () => {
    const f = await projectFixture();
    let finish: () => void = () => undefined;
    f.runtime.start.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = f.terminal.runProject();
    await vi.waitFor(() => expect(f.runtime.start).toHaveBeenCalledOnce());
    const old = f.runtimeOptions;
    await f.session.open('two');
    finish();
    await running;
    old.onProjectOutput?.('old output');
    old.onProjectState?.('running');
    expect(f.runtime.runProject).not.toHaveBeenCalled();
    expect(f.views[1]!.write).not.toHaveBeenCalledWith('old output');
    expect(f.views[1]!.dispose).toHaveBeenCalledOnce();
    expect(f.host.querySelector('[data-terminal-status]')?.textContent).toBe('尚未启动');
  });

  it('无启动脚本与进程启动失败直接写入项目终端，后续允许重试', async () => {
    const f = await fixture();
    await expect(f.terminal.runProject()).rejects.toThrow();
    expect(f.runtime.runProject).not.toHaveBeenCalled();
    expect(f.views[1]!.write).toHaveBeenCalled();
    await f.session.applyExternalFiles({ 'package.json': JSON.stringify({ scripts: { start: 'node main.js' } }) }, []);
    f.runtime.runProject.mockRejectedValueOnce(new Error('spawn failed'));
    await expect(f.terminal.runProject()).rejects.toThrow('spawn failed');
    expect(f.views[1]!.write).toHaveBeenCalledWith(expect.stringContaining('spawn failed'));
    await f.terminal.runProject();
    expect(f.runtime.runProject).toHaveBeenCalledTimes(2);
  });
});
