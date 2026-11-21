import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkbenchFiles, WorkbenchSnapshot } from '../session.js';
import type { TerminalProjectPlan } from './project-command.js';
import type { RuntimeCapabilities } from './runtime-adapter.js';
import {
  createTerminalRuntime,
  type TerminalContainer,
  type TerminalFileTree,
  type TerminalProcess,
  type TerminalRuntime
} from './terminal-runtime.js';

const encoder = new TextEncoder();
const instances: TerminalRuntime[] = [];

afterEach(() => {
  instances.splice(0).forEach(instance => instance.dispose());
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function snapshot(files: WorkbenchFiles, revision = '1'): WorkbenchSnapshot {
  return { projectId: 'one', revision, files };
}

function projectProcess(closeOutputOnExit = true) {
  const exit = deferred<number>();
  let output!: ReadableStreamDefaultController<string>;
  let outputClosed = false;
  const writeInput = vi.fn();
  // WebContainer 进程结束时才关闭输出；源流被取消后它再 close 会抛未捕获异常，运行时只能断开读取
  const cancelOutput = vi.fn(() => {
    outputClosed = true;
  });
  const process: TerminalProcess = {
    input: new WritableStream<string>({ write: writeInput }),
    output: new ReadableStream<string>({
      start: controller => {
        output = controller;
      },
      cancel: cancelOutput
    }),
    exit: exit.promise,
    resize: vi.fn(),
    kill: vi.fn()
  };
  void exit.promise.then(() => {
    if (!closeOutputOnExit || outputClosed) return;
    outputClosed = true;
    output.close();
  });
  return { process, exit, writeInput, cancelOutput, output: () => output };
}

const PROMPT = '\u001b]654;prompt\u0007';
const NPM_DEV: TerminalProjectPlan = { manager: 'npm', script: 'dev', args: [] };
const PROJECT_ENV_SPEC = { NODE_OPTIONS: '--disable-warning=ExperimentalWarning', NG_HMR_TEMPLATES: '0' };
/** 没有带状态标记 shell 的运行时：项目运行直接起安装、启动进程。 */
const processCapabilities: RuntimeCapabilities = { shell: { command: 'sh', args: [] }, pty: true };
/** 没有伪终端的运行时（vivari）：^C 到不了进程的信号处理。 */
const noPtyCapabilities: RuntimeCapabilities = { shell: { command: 'sh', args: [] }, pty: false };

/** jsh --osc 的替身：输出夹带 OSC 654 标记，提示符与真实 jsh 一致。 */
function projectShell(closeOutputOnExit = true) {
  const shell = projectProcess(closeOutputOnExit);
  const marker = (value: string): void => shell.output().enqueue(`\u001b]654;${value}\u0007`);
  const prompt = (): void => {
    shell.output().enqueue('\u001b[34m~/project\u001b[39m\r\n❯ ');
    marker('prompt');
  };
  return {
    ...shell,
    ready(): void {
      prompt();
      marker('interactive');
    },
    begin(pid: number): void {
      marker(`pid=${pid}`);
    },
    end(pid: number, code: number): void {
      marker(`exit=${pid}:${code}`);
      prompt();
    }
  };
}

const jshCapabilities: RuntimeCapabilities = {
  shell: { command: 'jsh', args: [] },
  markedShell: { command: 'jsh', args: ['--osc'] },
  pty: true
};

function fixture(bootGate?: Promise<void>, capabilities = jshCapabilities) {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const links = new Set<string>();
  const exit = deferred<number>();
  let output!: ReadableStreamDefaultController<string>;
  let watch: ((event: 'change' | 'rename', path: string) => void) | undefined;
  let serverReady: ((port: number, url: string) => void) | undefined;
  const writeInput = vi.fn();
  const cancelOutput = vi.fn();
  const process = {
    input: new WritableStream<string>({ write: writeInput }),
    output: new ReadableStream<string>({
      start: controller => {
        output = controller;
      },
      cancel: cancelOutput
    }),
    exit: exit.promise,
    resize: vi.fn(),
    kill: vi.fn()
  };
  const closeWatcher = vi.fn();
  const removeServerListener = vi.fn();
  const readDirectory = vi.fn(async (directory: string) => {
    const prefix = directory === '.' ? '' : `${directory}/`;
    const entries = new Map<string, 'directory' | 'file' | 'link'>();
    for (const path of [...files.keys(), ...links]) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const name = rest.split('/')[0];
      entries.set(
        name,
        rest.includes('/') ? 'directory'
        : links.has(path) ? 'link'
        : 'file'
      );
    }
    for (const path of directories) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest) entries.set(rest.split('/')[0], 'directory');
    }
    return [...entries].map(([name, kind]) => ({
      name,
      isFile: () => kind === 'file',
      isDirectory: () => kind === 'directory',
      isSymbolicLink: () => kind === 'link'
    }));
  });
  const mount = vi.fn(async (tree: TerminalFileTree) => {
    function walk(entries: TerminalFileTree, prefix = ''): void {
      for (const [name, entry] of Object.entries(entries)) {
        if ('directory' in entry) {
          directories.add(`${prefix}${name}`);
          walk(entry.directory, `${prefix}${name}/`);
        } else
          files.set(
            `${prefix}${name}`,
            typeof entry.file.contents === 'string' ? encoder.encode(entry.file.contents) : entry.file.contents
          );
      }
    }
    walk(tree);
  });
  const container: TerminalContainer = {
    fs: {
      readdir: readDirectory,
      readFile: vi.fn(async path => {
        const bytes = files.get(path);
        if (!bytes) throw new Error(`Missing ${path}`);
        return bytes;
      }),
      mkdir: vi.fn(async path => {
        directories.add(path);
      }),
      writeFile: vi.fn(async (path, value) => {
        if (directories.has(path)) throw new Error(`EISDIR: ${path}`);
        files.set(path, typeof value === 'string' ? encoder.encode(value) : value);
        watch?.('change', path);
      }),
      rm: vi.fn(async (path, options) => {
        if (directories.has(path) && !options.recursive) throw new Error(`EISDIR: ${path}`);
        files.delete(path);
        for (const file of files.keys()) if (file.startsWith(`${path}/`)) files.delete(file);
        for (const directory of directories)
          if (directory === path || directory.startsWith(`${path}/`)) directories.delete(directory);
        watch?.('rename', path);
      }),
      watch: vi.fn((_path, _options, listener) => {
        watch = listener;
        return { close: closeWatcher };
      })
    },
    mount,
    spawn: vi.fn(async () => process),
    on: vi.fn((_event, listener) => {
      serverReady = listener;
      return removeServerListener;
    }),
    teardown: vi.fn()
  };
  const boot = vi.fn(async () => {
    await bootGate;
    return container;
  });
  const options = {
    adapter: { id: 'webcontainer' as const, capabilities, boot },
    onOutput: vi.fn(),
    onFiles: vi.fn<(files: WorkbenchFiles, removed: readonly string[]) => Promise<void>>(async () => undefined),
    onServerReady: vi.fn(),
    onError: vi.fn(),
    onExit: vi.fn(),
    onProjectOutput: vi.fn(),
    onProjectState: vi.fn()
  };
  const runtime = createTerminalRuntime(options);
  instances.push(runtime);
  return {
    runtime,
    options,
    boot,
    container,
    process,
    files,
    links,
    writeInput,
    cancelOutput,
    output: () => output,
    exit,
    closeWatcher,
    removeServerListener,
    readDirectory,
    change: (path: string) => watch?.('change', path),
    ready: (port: number, url: string) => serverReady?.(port, url)
  };
}

/** 启动运行时并让项目终端就绪，返回时安装命令已经输入。 */
async function readyProject(plan: TerminalProjectPlan = NPM_DEV) {
  const f = fixture();
  const shell = projectShell();
  await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
  vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
  const running = f.runtime.runProject(plan);
  await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
  shell.ready();
  await running;
  return { ...f, shell };
}

describe('浏览器 Node 终端运行时', () => {
  it('项目终端是带标记的 jsh，就绪后输入安装命令，成功后再输入启动脚本', async () => {
    const f = fixture();
    const shell = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
    f.runtime.resizeProject({ cols: 100, rows: 30 });
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() =>
      expect(f.container.spawn).toHaveBeenNthCalledWith(2, 'jsh', ['--osc'], {
        terminal: { cols: 100, rows: 30 },
        env: { NODE_OPTIONS: '--disable-warning=ExperimentalWarning', NG_HMR_TEMPLATES: '0' }
      })
    );
    shell.ready();
    await running;
    await f.runtime.runProject(NPM_DEV);
    expect(shell.writeInput).toHaveBeenCalledExactlyOnceWith('npm install\r', expect.anything());
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('installing');
    expect(f.options.onProjectOutput).toHaveBeenCalledWith('\u001b[34m~/project\u001b[39m\r\n❯ ');
    shell.begin(7);
    shell.output().enqueue('\u001b[32madded 3 packages\u001b[0m\r\n');
    shell.end(7, 0);
    await vi.waitFor(() => expect(shell.writeInput).toHaveBeenLastCalledWith('npm run dev\r', expect.anything()));
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('running');
    expect(f.options.onProjectOutput).toHaveBeenCalledWith('\u001b[32madded 3 packages\u001b[0m\r\n');
    shell.begin(8);
    shell.end(8, 1);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 1));
    expect(f.options.onOutput).not.toHaveBeenCalled();
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ manager: 'pnpm', script: 'dev', args: ['--clearScreen', 'false'] }, 'pnpm run dev --clearScreen false\r'],
    [{ manager: 'npm', script: 'dev', args: ['--clearScreen', 'false'] }, 'npm run dev -- --clearScreen false\r']
  ] as const)('启动脚本的追加参数：pnpm 直接透传，npm 用 -- 分隔（%o）', async (plan, command) => {
    const f = await readyProject(plan);
    f.shell.begin(7);
    f.shell.end(7, 0);
    await vi.waitFor(() => expect(f.shell.writeInput).toHaveBeenLastCalledWith(command, expect.anything()));
  });

  it('pnpm 安装允许刷新锁文件并运行 start 脚本，切块的标记也能识别', async () => {
    const f = fixture();
    const shell = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
    const running = f.runtime.runProject({ manager: 'pnpm', script: 'start', args: [] });
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    shell.output().enqueue(`❯ ${PROMPT}\u001b]65`);
    shell.output().enqueue('4;inter');
    await vi.waitFor(() => expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('4;inter'));
    expect(shell.writeInput).not.toHaveBeenCalled();
    shell.output().enqueue('active\u0007');
    await running;
    expect(shell.writeInput).toHaveBeenCalledExactlyOnceWith('pnpm install --no-frozen-lockfile\r', expect.anything());
    shell.output().enqueue('\u001b]654;pid=3\u0007Done in 1.6s\r\n\u001b]654;exit=3:');
    shell.output().enqueue(`0\u0007${PROMPT}`);
    await vi.waitFor(() => expect(shell.writeInput).toHaveBeenLastCalledWith('pnpm run start\r', expect.anything()));
  });

  it('安装失败不启动脚本；项目终端忙时拒绝运行，空闲后再次运行复用同一个终端', async () => {
    const f = await readyProject();
    f.shell.begin(7);
    f.shell.end(7, 1);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 1));
    await f.runtime.writeProject('npm config list\r');
    expect(f.shell.writeInput).toHaveBeenLastCalledWith('npm config list\r', expect.anything());
    f.shell.begin(8);
    await vi.waitFor(() => expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('\u001b]654;pid=8\u0007'));
    await expect(f.runtime.runProject(NPM_DEV)).rejects.toThrow('正在执行命令');
    expect(f.shell.writeInput).toHaveBeenCalledTimes(2);
    f.shell.end(8, 0);
    await vi.waitFor(() => expect(f.options.onProjectOutput).toHaveBeenLastCalledWith(PROMPT));
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
    expect(f.shell.writeInput).toHaveBeenLastCalledWith('npm install\r', expect.anything());
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('installing');
  });

  it('安装期间 Ctrl+C 即使安装返回成功也不再输入启动脚本', async () => {
    const f = await readyProject();
    f.shell.begin(7);
    await f.runtime.writeProject('\u0003');
    expect(f.shell.writeInput).toHaveBeenLastCalledWith('\u0003', expect.anything());
    f.shell.end(7, 0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.shell.writeInput).not.toHaveBeenCalledWith('npm run dev\r', expect.anything());
  });

  it('服务运行中 Ctrl+C 回到提示符，之后的输入与尺寸仍交给项目终端', async () => {
    const f = await readyProject();
    f.shell.begin(7);
    f.shell.end(7, 0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('running'));
    f.shell.begin(8);
    await f.runtime.writeProject('\u0003');
    f.shell.end(8, 0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    await f.runtime.writeProject('ls\r');
    await f.runtime.write('pwd\r');
    expect(f.shell.writeInput).toHaveBeenLastCalledWith('ls\r', expect.anything());
    expect(f.writeInput).toHaveBeenCalledExactlyOnceWith('pwd\r', expect.anything());
    f.shell.begin(9);
    f.shell.end(9, 2);
    await vi.waitFor(() => expect(f.options.onProjectOutput).toHaveBeenLastCalledWith(PROMPT));
    expect(f.options.onProjectState).toHaveBeenCalledTimes(3);
    f.runtime.resizeProject({ cols: 120, rows: 32 });
    expect(f.shell.process.resize).toHaveBeenCalledWith({ cols: 120, rows: 32 });
    expect(f.process.resize).not.toHaveBeenCalled();
    expect(f.container.teardown).not.toHaveBeenCalled();
    expect(f.process.kill).not.toHaveBeenCalled();
  });

  it('项目终端就绪前 Ctrl+C 取消运行，不输入命令并保留终端', async () => {
    const f = fixture();
    const shell = projectShell();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    await f.runtime.writeProject('\u0003');
    spawn.resolve(shell.process);
    shell.ready();
    await running;
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130);
    expect(shell.writeInput).not.toHaveBeenCalled();
    expect(shell.process.kill).not.toHaveBeenCalled();
    await f.runtime.writeProject('pwd\r');
    expect(shell.writeInput).toHaveBeenCalledExactlyOnceWith('pwd\r', expect.anything());
  });

  it('项目终端启动失败拒绝运行，重试会重新启动终端', async () => {
    const f = fixture();
    const shell = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn)
      .mockRejectedValueOnce(new Error('jsh unavailable'))
      .mockResolvedValueOnce(shell.process);
    await expect(f.runtime.runProject(NPM_DEV)).rejects.toThrow('jsh unavailable');
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', -1);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(3));
    shell.ready();
    await running;
    expect(shell.writeInput).toHaveBeenCalledExactlyOnceWith('npm install\r', expect.anything());
    expect(f.options.onError).not.toHaveBeenCalled();
    expect(f.container.teardown).not.toHaveBeenCalled();
  });

  it('取消期间迟到的启动错误只结束取消状态，不伪装成启动失败', async () => {
    const f = fixture();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    await f.runtime.writeProject('\u0003');
    spawn.reject(new Error('spawn cancelled'));
    await running;
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130);
    expect(f.options.onError).not.toHaveBeenCalled();
  });

  it('输入启动脚本失败时报告错误并结束运行，不销毁 Shell', async () => {
    const f = await readyProject();
    f.shell.writeInput.mockRejectedValueOnce(new Error('input closed'));
    f.shell.begin(7);
    f.shell.end(7, 0);
    await vi.waitFor(() => expect(f.options.onError).toHaveBeenCalledWith(new Error('input closed')));
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', -1);
    expect(f.container.teardown).not.toHaveBeenCalled();
    expect(f.process.kill).not.toHaveBeenCalled();
  });

  it('项目终端退出时排空输出再报告 exited，之后忽略输入，下次运行重新启动终端', async () => {
    const f = await readyProject();
    const next = projectShell();
    f.shell.output().enqueue('exit\r\n');
    f.shell.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('exited', 0));
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('stopped', expect.anything());
    const output = f.options.onProjectOutput.mock.calls.findIndex(([value]) => value === 'exit\r\n');
    const exited = f.options.onProjectState.mock.calls.findIndex(([state]) => state === 'exited');
    expect(f.options.onProjectOutput.mock.invocationCallOrder[output]).toBeLessThan(
      f.options.onProjectState.mock.invocationCallOrder[exited]
    );
    await f.runtime.writeProject('ignored\r');
    expect(f.shell.writeInput).toHaveBeenCalledOnce();
    vi.mocked(f.container.spawn).mockResolvedValueOnce(next.process);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(3));
    next.ready();
    await running;
    expect(next.writeInput).toHaveBeenCalledExactlyOnceWith('npm install\r', expect.anything());
  });

  it('项目终端刚退出、输出还在排空时再次运行，直接启动新终端', async () => {
    const f = fixture();
    const shell = projectShell(false);
    const next = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process).mockResolvedValueOnce(next.process);
    const first = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    shell.ready();
    await first;
    shell.begin(7);
    shell.end(7, 1);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 1));
    shell.exit.resolve(0);
    await vi.waitFor(() => expect(shell.process.input.locked).toBe(false));
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(3));
    next.ready();
    await running;
    expect(next.writeInput).toHaveBeenCalledExactlyOnceWith('npm install\r', expect.anything());
    await vi.waitFor(() => expect(shell.process.output.locked).toBe(false), { timeout: 2000 });
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('exited', expect.anything());
  });

  it('项目终端退出但输出不关闭时，最多等 500ms 也会报告 exited', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const shell = projectShell(false);
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.advanceTimersByTimeAsync(0);
    shell.ready();
    await running;
    shell.exit.resolve(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('exited', 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('exited', 1);
    expect(shell.process.output.locked).toBe(false);
    expect(shell.cancelOutput).not.toHaveBeenCalled();
  });

  it('停止同时等待 Shell 和项目终端，回写最后文件再释放所有流', async () => {
    const f = await readyProject();
    f.process.kill.mockImplementation(() => f.exit.resolve(0));
    vi.mocked(f.shell.process.kill).mockImplementation(() => {
      f.files.set('package-lock.json', encoder.encode('installed'));
      f.shell.exit.resolve(0);
    });
    await f.runtime.stop();
    expect(f.shell.process.kill).toHaveBeenCalledOnce();
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'package-lock.json': 'installed' }, []);
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onProjectState).toHaveBeenCalledExactlyOnceWith('installing');
    await vi.waitFor(() => {
      expect(f.process.input.locked).toBe(false);
      expect(f.shell.process.input.locked).toBe(false);
      expect(f.shell.process.output.locked).toBe(false);
    });
    await expect(f.runtime.writeProject('late')).rejects.toThrow('释放');
    await expect(f.runtime.runProject(NPM_DEV)).rejects.toThrow('释放');
  });

  it('释放期间迟到的项目终端被杀掉，不产生任何项目回调', async () => {
    const f = fixture();
    const shell = projectShell();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    f.runtime.dispose();
    f.options.onProjectState.mockClear();
    spawn.resolve(shell.process);
    shell.ready();
    await running;
    shell.exit.resolve(0);
    await Promise.resolve();
    expect(shell.process.kill).toHaveBeenCalledOnce();
    expect(shell.cancelOutput).not.toHaveBeenCalled();
    expect(shell.writeInput).not.toHaveBeenCalled();
    expect(f.options.onProjectState).not.toHaveBeenCalled();
    expect(f.options.onProjectOutput).not.toHaveBeenCalled();
    expect(f.options.onError).not.toHaveBeenCalled();
  });

  it('项目终端就绪前释放，运行随之结束且不输入命令', async () => {
    const f = fixture();
    const shell = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(shell.process.output.locked).toBe(true));
    f.runtime.dispose();
    await running;
    expect(shell.process.kill).toHaveBeenCalledOnce();
    expect(shell.writeInput).not.toHaveBeenCalled();
    expect(f.options.onProjectState).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(shell.process.output.locked).toBe(false));
    expect(shell.cancelOutput).not.toHaveBeenCalled();
  });

  it('挂载已保存文件并连接真实 shell 的输入、输出、尺寸、服务地址和退出', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'src/main.ts': 'console.log(1)' }), { cols: 80, rows: 24 });
    expect(f.container.spawn).toHaveBeenCalledWith('jsh', [], { terminal: { cols: 80, rows: 24 } });
    expect(new TextDecoder().decode(f.files.get('src/main.ts'))).toBe('console.log(1)');
    f.output().enqueue('\u001b[31merror\u001b[0m\r\n');
    await f.runtime.write('node --version\r');
    await vi.waitFor(() => expect(f.options.onOutput).toHaveBeenCalledWith('\u001b[31merror\u001b[0m\r\n'));
    expect(f.process.input.locked).toBe(true);
    expect(f.writeInput).toHaveBeenCalledWith('node --version\r', expect.anything());
    f.runtime.resize({ cols: 120, rows: 32 });
    expect(f.process.resize).toHaveBeenCalledWith({ cols: 120, rows: 32 });
    f.ready(5173, 'https://example.webcontainer-api.io');
    expect(f.options.onServerReady).toHaveBeenCalledWith(5173, 'https://example.webcontainer-api.io');
    f.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onExit).toHaveBeenCalledWith(0));
  });

  it('进程模式：进程退出后先排空最后一批错误输出，再报告退出并允许重新运行', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const serve = projectProcess(false);
    const retry = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn)
      .mockResolvedValueOnce(install.process)
      .mockResolvedValueOnce(serve.process)
      .mockResolvedValueOnce(retry.process);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('running'));
    serve.exit.resolve(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('stopped', 1);
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenCalledTimes(3);
    serve.output().enqueue('last compiler error\r\n');
    serve.output().close();
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 1));
    const outputCalls = f.options.onProjectOutput.mock.calls;
    const lastError = outputCalls.findIndex(([value]) => value === 'last compiler error\r\n');
    const stopped = f.options.onProjectState.mock.calls.findIndex(([state]) => state === 'stopped');
    expect(lastError).toBeGreaterThanOrEqual(0);
    expect(f.options.onProjectOutput.mock.invocationCallOrder[lastError]).toBeLessThan(
      f.options.onProjectState.mock.invocationCallOrder[stopped]
    );
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenCalledTimes(4);
  });

  it('进程模式：不关闭输出的进程不会阻塞后续阶段，停止会中断输出排空等待', async () => {
    vi.useFakeTimers();
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess(false);
    const serve = projectProcess(false);
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(serve.process);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('running');
    expect(install.process.output.locked).toBe(false);
    serve.exit.resolve(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('stopped', 0);
    f.process.kill.mockImplementation(() => f.exit.resolve(0));
    await f.runtime.stop();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('进程模式：项目先安装再启动脚本，输出与输入尺寸独立于交互 Shell，重复运行不新增进程', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const serve = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(serve.process);
    f.runtime.resizeProject({ cols: 100, rows: 30 });
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenNthCalledWith(2, 'npm', ['install'], {
      terminal: { cols: 100, rows: 30 },
      env: PROJECT_ENV_SPEC
    });
    expect(f.options.onProjectOutput).toHaveBeenNthCalledWith(1, '\r\n$ npm install\r\n');
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('installing');
    install.output().enqueue('\u001b[32madded 3 packages\u001b[0m\r\n');
    await vi.waitFor(() =>
      expect(f.options.onProjectOutput).toHaveBeenCalledWith('\u001b[32madded 3 packages\u001b[0m\r\n')
    );
    expect(f.options.onOutput).not.toHaveBeenCalled();
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
    install.exit.resolve(0);
    await vi.waitFor(() =>
      expect(f.container.spawn).toHaveBeenNthCalledWith(3, 'npm', ['run', 'dev'], {
        terminal: { cols: 100, rows: 30 },
        env: PROJECT_ENV_SPEC
      })
    );
    expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('\r\n$ npm run dev\r\n');
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('running');
    await f.runtime.writeProject('input\r');
    await f.runtime.write('pwd\r');
    expect(serve.writeInput).toHaveBeenCalledWith('input\r', expect.anything());
    expect(f.writeInput).toHaveBeenCalledWith('pwd\r', expect.anything());
    f.runtime.resizeProject({ cols: 120, rows: 32 });
    expect(serve.process.resize).toHaveBeenCalledWith({ cols: 120, rows: 32 });
    expect(f.process.resize).not.toHaveBeenCalled();
    await f.runtime.writeProject('\u0003');
    expect(serve.writeInput).toHaveBeenCalledWith('\u0003', expect.anything());
    serve.exit.resolve(130);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.container.teardown).not.toHaveBeenCalled();
    expect(f.process.kill).not.toHaveBeenCalled();
  });

  it('进程模式：pnpm 安装允许刷新锁文件，并运行 start 脚本', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const serve = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(serve.process);
    await f.runtime.runProject({ manager: 'pnpm', script: 'start', args: [] });
    expect(f.container.spawn).toHaveBeenNthCalledWith(2, 'pnpm', ['install', '--no-frozen-lockfile'], {
      terminal: { cols: 80, rows: 24 },
      env: PROJECT_ENV_SPEC
    });
    expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('\r\n$ pnpm install --no-frozen-lockfile\r\n');
    install.exit.resolve(0);
    await vi.waitFor(() =>
      expect(f.container.spawn).toHaveBeenNthCalledWith(3, 'pnpm', ['run', 'start'], {
        terminal: { cols: 80, rows: 24 },
        env: PROJECT_ENV_SPEC
      })
    );
    expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('\r\n$ pnpm run start\r\n');
  });

  it('进程模式：安装失败不运行项目，Shell 保持可用并允许再次运行', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const retry = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(retry.process);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(1);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 1));
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
    await f.runtime.write('npm config list\r');
    expect(f.writeInput).toHaveBeenCalledWith('npm config list\r', expect.anything());
    await f.runtime.writeProject('ls\r');
    expect(install.writeInput).not.toHaveBeenCalledWith('ls\r', expect.anything());
    await f.runtime.runProject(NPM_DEV);
    expect(f.container.spawn).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(install.process.output.locked).toBe(false));
  });

  it('进程模式：安装期间 Ctrl+C 即使安装返回成功也不会继续启动服务', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process);
    await f.runtime.runProject(NPM_DEV);
    await f.runtime.writeProject('\u0003');
    expect(install.writeInput).toHaveBeenCalledWith('\u0003', expect.anything());
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
  });

  it('进程模式（无伪终端）：Ctrl+C 回显 ^C 并结束前台服务进程，不把控制字符写进进程输入', async () => {
    const f = fixture(undefined, noPtyCapabilities);
    const install = projectProcess();
    const serve = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(serve.process);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('running'));
    await f.runtime.writeProject('h\r');
    expect(serve.writeInput).toHaveBeenCalledWith('h\r', expect.anything());
    await f.runtime.writeProject('\u0003');
    expect(f.options.onProjectOutput).toHaveBeenLastCalledWith('^C\r\n');
    expect(serve.process.kill).toHaveBeenCalledOnce();
    expect(serve.writeInput).not.toHaveBeenCalledWith('\u0003', expect.anything());
    serve.exit.resolve(143);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.process.kill).not.toHaveBeenCalled();
  });

  it('进程模式（无伪终端）：安装期间 Ctrl+C 结束安装进程，不再启动服务', async () => {
    const f = fixture(undefined, noPtyCapabilities);
    const install = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process);
    await f.runtime.runProject(NPM_DEV);
    await f.runtime.writeProject('\u0003');
    expect(install.process.kill).toHaveBeenCalledOnce();
    expect(install.writeInput).not.toHaveBeenCalled();
    install.exit.resolve(143);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
  });

  it('进程模式：安装 spawn 尚未返回时取消，迟到进程会被杀掉且不启动服务', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    await f.runtime.writeProject('\u0003');
    spawn.resolve(install.process);
    await running;
    expect(install.process.kill).toHaveBeenCalledOnce();
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.container.spawn).toHaveBeenCalledTimes(2);
  });

  it('进程模式：安装后启动服务的 spawn 期间取消，迟到服务会被杀掉', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const serve = projectProcess();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockReturnValueOnce(spawn.promise);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(3));
    await f.runtime.writeProject('\u0003');
    spawn.resolve(serve.process);
    await vi.waitFor(() => expect(serve.process.kill).toHaveBeenCalledOnce());
    serve.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
  });

  it('进程模式：首次 spawn 错误拒绝运行，后续启动错误报告但不销毁 Shell', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockRejectedValueOnce(new Error('install unavailable'));
    await expect(f.runtime.runProject(NPM_DEV)).rejects.toThrow('install unavailable');
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', -1);
    vi.mocked(f.container.spawn)
      .mockResolvedValueOnce(install.process)
      .mockRejectedValueOnce(new Error('serve unavailable'));
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.options.onError).toHaveBeenCalledWith(new Error('serve unavailable')));
    expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', -1);
    expect(f.container.teardown).not.toHaveBeenCalled();
    expect(f.process.kill).not.toHaveBeenCalled();
  });

  it('进程模式：取消期间迟到的 spawn 错误只结束取消状态，不伪装成启动失败', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockReturnValueOnce(spawn.promise);
    await f.runtime.runProject(NPM_DEV);
    install.exit.resolve(0);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(3));
    await f.runtime.writeProject('\u0003');
    spawn.reject(new Error('spawn cancelled'));
    await vi.waitFor(() => expect(f.options.onProjectState).toHaveBeenLastCalledWith('stopped', 130));
    expect(f.options.onError).not.toHaveBeenCalled();
    expect(f.options.onProjectOutput).not.toHaveBeenCalledWith(expect.stringContaining('spawn cancelled'));
  });

  it('进程模式：停止同时等待 Shell 和项目进程，回写最后文件再释放所有流', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process);
    await f.runtime.runProject(NPM_DEV);
    f.process.kill.mockImplementation(() => f.exit.resolve(0));
    vi.mocked(install.process.kill).mockImplementation(() => {
      f.files.set('package-lock.json', encoder.encode('installed'));
      install.exit.resolve(0);
    });
    await f.runtime.stop();
    expect(install.process.kill).toHaveBeenCalledOnce();
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'package-lock.json': 'installed' }, []);
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('running');
    expect(f.options.onProjectState).not.toHaveBeenCalledWith('stopped', 130);
    await vi.waitFor(() => {
      expect(f.process.input.locked).toBe(false);
      expect(install.process.input.locked).toBe(false);
      expect(install.process.output.locked).toBe(false);
    });
    await expect(f.runtime.writeProject('late')).rejects.toThrow('释放');
    await expect(f.runtime.runProject(NPM_DEV)).rejects.toThrow('释放');
  });

  it('进程模式：释放期间迟到项目进程被杀掉，不产生任何项目回调', async () => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const spawn = deferred<TerminalProcess>();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalledTimes(2));
    f.runtime.dispose();
    f.options.onProjectState.mockClear();
    f.options.onProjectOutput.mockClear();
    spawn.resolve(install.process);
    await running;
    install.exit.resolve(0);
    await Promise.resolve();
    expect(install.process.kill).toHaveBeenCalledOnce();
    expect(f.options.onProjectState).not.toHaveBeenCalled();
    expect(f.options.onProjectOutput).not.toHaveBeenCalled();
    expect(f.options.onError).not.toHaveBeenCalled();
  });

  it.each([
    [{ manager: 'pnpm', script: 'dev', args: ['--clearScreen', 'false'] }, ['run', 'dev', '--clearScreen', 'false']],
    [
      { manager: 'npm', script: 'dev', args: ['--clearScreen', 'false'] },
      ['run', 'dev', '--', '--clearScreen', 'false']
    ]
  ] as const)('进程模式：启动脚本的追加参数按包管理器透传（%o）', async (plan, args) => {
    const f = fixture(undefined, processCapabilities);
    const install = projectProcess();
    const serve = projectProcess();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(install.process).mockResolvedValueOnce(serve.process);
    await f.runtime.runProject(plan);
    install.exit.resolve(0);
    await vi.waitFor(() =>
      expect(f.container.spawn).toHaveBeenNthCalledWith(3, plan.manager, args, {
        terminal: { cols: 80, rows: 24 },
        env: PROJECT_ENV_SPEC
      })
    );
    expect(f.options.onProjectOutput).toHaveBeenCalledWith(`\r\n$ ${plan.manager} ${args.join(' ')}\r\n`);
  });

  it('交互 Shell 与项目终端按适配器声明的命令启动', async () => {
    const f = fixture(undefined, {
      shell: { command: 'sh', args: ['-i'] },
      markedShell: { command: 'marked-sh', args: ['--status'] },
      pty: true
    });
    const shell = projectShell();
    await f.runtime.start(snapshot({ 'package.json': '{}' }), { cols: 80, rows: 24 });
    expect(f.container.spawn).toHaveBeenCalledWith('sh', ['-i'], { terminal: { cols: 80, rows: 24 } });
    vi.mocked(f.container.spawn).mockResolvedValueOnce(shell.process);
    const running = f.runtime.runProject(NPM_DEV);
    await vi.waitFor(() =>
      expect(f.container.spawn).toHaveBeenNthCalledWith(2, 'marked-sh', ['--status'], expect.anything())
    );
    shell.ready();
    await running;
    expect(f.boot).toHaveBeenCalledOnce();
  });

  it('同步编辑器保存时只写改动，不把写回事件再次当成终端修改', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'src/main.ts': 'one', 'old.ts': 'old' }), { cols: 80, rows: 24 });
    await f.runtime.sync(snapshot({ 'src/main.ts': 'two', 'new.ts': 'new' }, '2'));
    expect(f.container.fs.writeFile).toHaveBeenCalledWith('src/main.ts', 'two');
    expect(f.container.fs.rm).toHaveBeenCalledWith('old.ts', { force: true });
    await f.runtime.flush();
    expect(f.options.onFiles).not.toHaveBeenCalled();
    await f.runtime.sync(snapshot({ 'src/main.ts': 'two', 'new.ts': 'new' }, '3'));
    expect(f.container.fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('终端新增、修改、删除与二进制回写为同一批次，跳过安装产物与符号链接', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one', 'old.ts': 'old' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('two'));
    f.files.delete('old.ts');
    f.files.set('src/new.ts', encoder.encode('new'));
    f.files.set('image.png', new Uint8Array([0, 255]));
    f.files.set('node_modules/pkg/index.js', encoder.encode('large dependency'));
    f.files.set('dist/main.js', encoder.encode('build output'));
    f.files.set('.git/config', encoder.encode('private metadata'));
    f.links.add('linked.ts');
    f.change('main.ts');
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledWith(
      {
        'main.ts': 'two',
        'src/new.ts': 'new',
        'image.png': new Uint8Array([0, 255])
      },
      ['old.ts']
    );
    expect(f.readDirectory).not.toHaveBeenCalledWith('node_modules', { withFileTypes: true });
    expect(f.readDirectory).not.toHaveBeenCalledWith('dist', { withFileTypes: true });
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledTimes(1);
  });

  it('失败的持久化不推进基线，重试 flush 会再次回写', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('two'));
    f.options.onFiles.mockRejectedValueOnce(new Error('revision conflict'));
    f.change('main.ts');
    await expect(f.runtime.flush()).rejects.toThrow('revision conflict');
    await f.runtime.flush();
    expect(f.options.onFiles).toHaveBeenCalledTimes(2);
  });

  it('陈旧的编辑器快照不会覆盖未回写的终端修改或删除终端新文件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('terminal'));
    f.files.set('new.ts', encoder.encode('created in terminal'));
    let echo: Promise<void> | undefined;
    f.options.onFiles.mockImplementationOnce(async writes => {
      echo = f.runtime.sync(snapshot({ ...writes, 'other.ts': 'editor' }, '3'));
    });
    await f.runtime.sync(snapshot({ 'main.ts': 'one', 'other.ts': 'editor' }, '2'));
    await echo;
    expect(new TextDecoder().decode(f.files.get('main.ts'))).toBe('terminal');
    expect(new TextDecoder().decode(f.files.get('new.ts'))).toBe('created in terminal');
    expect(new TextDecoder().decode(f.files.get('other.ts'))).toBe('editor');
    expect(f.options.onFiles).toHaveBeenCalledTimes(1);
  });

  it('编辑器把目录换成单文件时移除旧空目录，也支持单文件换成目录', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'a/b.js': 'nested' }), { cols: 80, rows: 24 });
    await f.runtime.sync(snapshot({ a: 'single file' }, '2'));
    expect(f.container.fs.rm).toHaveBeenCalledWith('a', { force: true, recursive: true });
    expect(new TextDecoder().decode(f.files.get('a'))).toBe('single file');
    await f.runtime.sync(snapshot({ 'a/c.js': 'nested again' }, '3'));
    expect(f.files.has('a')).toBe(false);
    expect(new TextDecoder().decode(f.files.get('a/c.js'))).toBe('nested again');
  });

  it('目录里终端新建文件先持久化，陈旧快照不能递归删除该目录', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'a/b.js': 'nested' }), { cols: 80, rows: 24 });
    f.files.set('a/new.ts', encoder.encode('new terminal file'));
    let echo: Promise<void> | undefined;
    f.options.onFiles.mockImplementationOnce(async writes => {
      echo = f.runtime.sync(snapshot({ 'a/b.js': 'nested', ...writes }, '3'));
    });
    await f.runtime.sync(snapshot({ a: 'stale replacement' }, '2'));
    await echo;
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'a/new.ts': 'new terminal file' }, []);
    expect(f.files.has('a/new.ts')).toBe(true);
    expect(f.files.has('a/b.js')).toBe(true);
    expect(f.files.has('a')).toBe(false);
    expect(f.container.fs.rm).not.toHaveBeenCalledWith('a/b.js', { force: true });
    expect(f.container.fs.rm).not.toHaveBeenCalledWith('a', { force: true, recursive: true });
  });

  it('终端回写失败时拒绝正向同步，保留尚未持久化的容器文件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('terminal'));
    f.options.onFiles.mockRejectedValueOnce(new Error('storage failed'));
    await expect(f.runtime.sync(snapshot({ 'main.ts': 'editor' }, '2'))).rejects.toThrow('storage failed');
    expect(new TextDecoder().decode(f.files.get('main.ts'))).toBe('terminal');
    expect(f.container.fs.writeFile).not.toHaveBeenCalled();
  });

  it('启动失败会释放全局容器所有权，下一项目仍能启动', async () => {
    const failed = fixture();
    failed.boot.mockRejectedValueOnce(new Error('blocked by browser'));
    await expect(failed.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 })).rejects.toThrow(
      'blocked by browser'
    );
    const next = fixture();
    await next.runtime.start(snapshot({ 'main.ts': 'two' }), { cols: 80, rows: 24 });
    expect(next.boot).toHaveBeenCalledOnce();
  });

  it('产物目录事件不会触发全项目扫描', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.change('node_modules/pkg/index.js');
    f.change('dist/main.js');
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.readDirectory).not.toHaveBeenCalled();
  });

  it('不允许将其他项目快照写进已启动容器', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await expect(f.runtime.sync({ ...snapshot({ 'main.ts': 'two' }), projectId: 'two' })).rejects.toThrow('项目');
    expect(f.container.fs.writeFile).not.toHaveBeenCalled();
  });

  it('超限文件与非法路径不会进入持久化回调', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('huge.ts', new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(f.runtime.flush()).rejects.toThrow('limit');
    expect(f.options.onFiles).not.toHaveBeenCalled();
    f.files.delete('huge.ts');
    f.files.set('-invalid.ts', encoder.encode('invalid'));
    await expect(f.runtime.flush()).rejects.toThrow('path');
    expect(f.options.onFiles).not.toHaveBeenCalled();
  });

  it('释放终止进程与监听器，并阻止迟到输出、服务地址和退出事件', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.runtime.dispose();
    f.ready(3000, 'https://late.webcontainer-api.io');
    f.exit.resolve(0);
    await Promise.resolve();
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.closeWatcher).toHaveBeenCalledOnce();
    expect(f.removeServerListener).toHaveBeenCalledOnce();
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onServerReady).not.toHaveBeenCalled();
    expect(f.options.onExit).not.toHaveBeenCalled();
    await expect(f.runtime.write('pwd\r')).rejects.toThrow('释放');
    await vi.waitFor(() => expect(f.process.output.locked).toBe(false));
    expect(f.cancelOutput).not.toHaveBeenCalled();
  });

  it('启动中释放后等待旧容器销毁才允许下一次 boot', async () => {
    const gate = deferred<void>();
    const old = fixture(gate.promise);
    const first = old.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await vi.waitFor(() => expect(old.boot).toHaveBeenCalled());
    old.runtime.dispose();
    const next = fixture();
    const second = next.runtime.start(snapshot({ 'main.ts': 'two' }), { cols: 80, rows: 24 });
    await Promise.resolve();
    expect(next.boot).not.toHaveBeenCalled();
    gate.resolve();
    await first;
    await second;
    expect(old.container.teardown).toHaveBeenCalledOnce();
    expect(old.container.spawn).not.toHaveBeenCalled();
    expect(next.boot).toHaveBeenCalledOnce();
  });

  it('停止等待进程退出后的最后一次文件变更持久化，再销毁容器', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.process.kill.mockImplementation(() => {
      f.files.set('main.ts', encoder.encode('last write'));
      f.exit.resolve(0);
    });
    await f.runtime.stop();
    expect(f.options.onFiles).toHaveBeenCalledWith({ 'main.ts': 'last write' }, []);
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.options.onExit).not.toHaveBeenCalled();
    expect(f.container.teardown).toHaveBeenCalledOnce();
    expect(f.options.onFiles.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.container.teardown).mock.invocationCallOrder[0]
    );
  });

  it('读取文件期间释放后忽略已销毁文件系统的迟到异常', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    const read = deferred<Uint8Array>();
    vi.mocked(f.container.fs.readFile).mockReturnValueOnce(read.promise);
    const flushed = f.runtime.flush();
    await vi.waitFor(() => expect(f.container.fs.readFile).toHaveBeenCalled());
    f.runtime.dispose();
    read.reject(new Error('filesystem torn down'));
    await flushed;
    expect(f.options.onFiles).not.toHaveBeenCalled();
    expect(f.options.onError).not.toHaveBeenCalled();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('spawn 期间释放也会杀掉迟到进程，不重复销毁监听器或容器', async () => {
    const f = fixture();
    const spawn = deferred<typeof f.process>();
    vi.mocked(f.container.spawn).mockReturnValueOnce(spawn.promise);
    const pending = f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    await vi.waitFor(() => expect(f.container.spawn).toHaveBeenCalled());
    f.runtime.dispose();
    spawn.resolve(f.process);
    await pending;
    expect(f.process.kill).toHaveBeenCalledOnce();
    expect(f.closeWatcher).toHaveBeenCalledOnce();
    expect(f.removeServerListener).toHaveBeenCalledOnce();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('停止时持久化失败保留容器，重试成功后才销毁', async () => {
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    f.files.set('main.ts', encoder.encode('unsaved terminal edit'));
    f.process.kill.mockImplementation(() => f.exit.resolve(0));
    f.options.onFiles.mockRejectedValueOnce(new Error('storage failed'));
    await expect(f.runtime.stop()).rejects.toThrow('storage failed');
    expect(f.container.teardown).not.toHaveBeenCalled();
    await f.runtime.stop();
    expect(f.options.onFiles).toHaveBeenCalledTimes(2);
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });

  it('停止无响应进程明确超时并保留可重试的容器', async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.runtime.start(snapshot({ 'main.ts': 'one' }), { cols: 80, rows: 24 });
    const stopped = expect(f.runtime.stop()).rejects.toThrow('停止超时');
    await vi.advanceTimersByTimeAsync(5000);
    await stopped;
    expect(f.container.teardown).not.toHaveBeenCalled();
    f.exit.resolve(0);
    await f.runtime.stop();
    expect(f.container.teardown).toHaveBeenCalledOnce();
  });
});
