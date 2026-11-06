import { decodeFileBytes, encodeFileBytes } from '../git/file-encoding.js';
import { assertGitFileLimits } from '../git/git-archive.js';
import { assertGitPath, assertNoPathCollisions } from '../git/git-paths.js';
import { GIT_WORKBENCH_LIMITS } from '../git/git-protocol.js';
import type { WorkbenchFiles, WorkbenchSnapshot } from '../session.js';
import type { TerminalProjectPlan } from './project-command.js';

/** 交互终端当前的字符尺寸。 */
export interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
}

/** 挂载到容器的源码树，不包含宿主 Git 元数据。 */
export interface TerminalFileTree {
  [name: string]: { file: { contents: string | Uint8Array } } | { directory: TerminalFileTree };
}

/** 浏览器容器的交互进程。 */
export interface TerminalProcess {
  readonly input: WritableStream<string>;
  readonly output: ReadableStream<string>;
  readonly exit: Promise<number>;
  resize(size: TerminalSize): void;
  kill(): void;
}

/** 文件系统目录条目，仅遍历普通文件和真实目录。 */
export interface TerminalDirectoryEntry {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
}

/** 可替换的容器边界，便于验证真实流与异步释放。 */
export interface TerminalContainer {
  readonly fs: {
    readdir(path: string, options: { withFileTypes: true }): Promise<readonly TerminalDirectoryEntry[]>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, value: string | Uint8Array): Promise<void>;
    mkdir(path: string, options: { recursive: true }): Promise<unknown>;
    rm(path: string, options: { force: true; recursive?: boolean }): Promise<void>;
    watch(
      path: string,
      options: { recursive: true },
      listener: (event: 'change' | 'rename', filename: string | Uint8Array) => void
    ): {
      close(): void;
    };
  };
  mount(tree: TerminalFileTree): Promise<void>;
  spawn(
    command: string,
    args: string[],
    options: { terminal: TerminalSize; env?: Record<string, string> }
  ): Promise<TerminalProcess>;
  on(event: 'server-ready', listener: (port: number, url: string) => void): () => void;
  teardown(): void;
}

/** 浏览器 Node 运行时的宿主回调。 */
export interface TerminalRuntimeOptions {
  readonly apiKey?: string;
  readonly boot?: () => Promise<TerminalContainer>;
  onOutput(data: string): void;
  onFiles(writes: WorkbenchFiles, removedPaths: readonly string[]): Promise<void>;
  onServerReady(port: number, url: string): void;
  onError(cause: unknown): void;
  onExit(code: number): void;
  onProjectOutput?(data: string): void;
  /** 项目运行阶段；`exited` 表示项目终端本身已退出，下次运行会重新启动。 */
  onProjectState?(state: 'installing' | 'running' | 'stopped' | 'exited', exitCode?: number): void;
}

/** 当前项目独占的浏览器 Node 进程与文件同步。 */
export interface TerminalRuntime {
  start(snapshot: WorkbenchSnapshot, size: TerminalSize): Promise<void>;
  write(data: string): Promise<void>;
  resize(size: TerminalSize): void;
  runProject(plan: TerminalProjectPlan): Promise<void>;
  writeProject(data: string): Promise<void>;
  resizeProject(size: TerminalSize): void;
  sync(snapshot: WorkbenchSnapshot): Promise<void>;
  flush(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
}

/** 项目终端：带状态标记的 jsh，「运行」把命令输入这里，和交互 Shell 互不干扰。 */
interface ProjectShell {
  readonly process: TerminalProcess;
  readonly input: WritableStreamDefaultWriter<string>;
  readonly outputAbort: AbortController;
  readonly waiters: Set<() => void>;
  outputDone: Promise<void>;
  /** 上一块输出结尾尚未闭合的标记。 */
  partial: string;
  interactive: boolean;
  /** 停在提示符，没有前台命令。 */
  idle: boolean;
  /** 输入命令后已收到它的 pid 标记。 */
  started: boolean;
  /** 最近一条命令的退出码。 */
  status: number;
  killed: boolean;
  exited: boolean;
  inputClosed: boolean;
}

interface ProjectExecution {
  readonly ready: Promise<void>;
  done: Promise<void>;
  active: boolean;
  cancelled: boolean;
}

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.angular',
  '.vite',
  '.cache',
  'coverage'
]);
const sameFile = (left: string | Uint8Array | undefined, right: string | Uint8Array | undefined): boolean => {
  if (left === undefined || right === undefined) return left === right;
  const a = encodeFileBytes(left);
  const b = encodeFileBytes(right);
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
};
const ignoredPath = (path: string): boolean => path.split('/').some(part => ignoredDirectories.has(part));
const overlappingPath = (left: string, right: string): boolean =>
  left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
let availableContainer: Promise<void> = Promise.resolve();
let configuredAPIKey: string | undefined;
let webContainerBootCalled = false;

function filteredFiles(files: WorkbenchFiles): WorkbenchFiles {
  const entries = Object.entries(files).filter(([path]) => !ignoredPath(path));
  const paths = entries.map(([path]) => path);
  paths.forEach(path => assertGitPath(path));
  assertNoPathCollisions(paths);
  assertGitFileLimits(entries.map(([path, value]) => ({ path, bytes: new Uint8Array(encodeFileBytes(value)) })));
  return Object.fromEntries(
    entries.map(([path, value]) => [path, typeof value === 'string' ? value : new Uint8Array(value)])
  );
}

function fileTree(files: WorkbenchFiles): TerminalFileTree {
  const tree = Object.create(null) as TerminalFileTree;
  for (const [path, contents] of Object.entries(files)) {
    const names = path.split('/');
    let directory = tree;
    for (const name of names.slice(0, -1)) {
      const entry = (directory[name] ??= { directory: Object.create(null) as TerminalFileTree });
      if (!('directory' in entry)) throw new Error(`文件与目录冲突：${path}`);
      directory = entry.directory;
    }
    directory[names.at(-1)!] = { file: { contents } };
  }
  return tree;
}

// jsh --osc 在输出里夹带 ESC ] 654 ; <标记> BEL：interactive、prompt、pid=N、exit=pid:code，xterm 不显示它们
const MARKER_START = '\u001b]654;';
const MARKER_END = '\u0007';
const MARKER_LIMIT = 64;

/** 把每个完整标记交给 visit，返回结尾尚未闭合、要拼上下一块输出再解析的部分。 */
function parseMarkers(text: string, visit: (marker: string) => void): string {
  let start = text.indexOf(MARKER_START);
  while (start >= 0) {
    const end = text.indexOf(MARKER_END, start);
    if (end < 0) return text.length - start > MARKER_LIMIT ? '' : text.slice(start);
    visit(text.slice(start + MARKER_START.length, end));
    start = text.indexOf(MARKER_START, end);
  }
  const escape = text.lastIndexOf('\u001b');
  const tail = escape < 0 ? '' : text.slice(escape);
  return MARKER_START.startsWith(tail) ? tail : '';
}

function readMarker(shell: ProjectShell, marker: string): void {
  if (marker === 'interactive') shell.interactive = true;
  if (marker === 'prompt') shell.idle = true;
  if (marker.startsWith('pid=')) {
    shell.idle = false;
    shell.started = true;
  }
  const code = /^exit=-?\d+:(-?\d+)$/.exec(marker)?.[1];
  if (code !== undefined) shell.status = Number(code);
}

const installCommand = (plan: TerminalProjectPlan): string =>
  plan.manager === 'pnpm' ? 'pnpm install --no-frozen-lockfile' : 'npm install';

/** 启动脚本命令；npm 要用 `--` 把追加参数交给脚本，pnpm 直接透传。 */
function startCommand(plan: TerminalProjectPlan): string {
  const args = plan.args.length && plan.manager === 'npm' ? ['--', ...plan.args] : plan.args;
  return [plan.manager, 'run', plan.script, ...args].join(' ');
}

/**
 * 项目终端的环境变量：
 * - 屏蔽 Node 实验特性警告：vite 8 在 WebContainer 里走 rolldown 的 WASI 绑定，每次启动刷 4 条；
 * - 关掉 Angular 组件模板热更新：WebContainer 预览页会静默丢弃它，改走整页刷新才能看到改动。
 */
const PROJECT_ENV = { NODE_OPTIONS: '--disable-warning=ExperimentalWarning', NG_HMR_TEMPLATES: '0' };

/** 停止读取时只断开、不取消源流：WebContainer 在进程结束时才关闭输出，源流已取消会抛未捕获异常。 */
const detachOutput = (signal: AbortSignal): StreamPipeOptions => ({ signal, preventCancel: true });

/** 懒加载 WebContainer，按项目串行启动并双向同步已保存源码。 */
export function createWebContainerRuntime(options: TerminalRuntimeOptions): TerminalRuntime {
  let disposed = false;
  let projectId: string | undefined;
  let started: Promise<void> | undefined;
  let container: TerminalContainer | undefined;
  let process: TerminalProcess | undefined;
  let killed = false;
  let stopping = false;
  let stoppingPromise: Promise<void> | undefined;
  let input: WritableStreamDefaultWriter<string> | undefined;
  let watcher: { close(): void } | undefined;
  let removeServerListener: (() => void) | undefined;
  let releaseContainer: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tasks: Promise<void> = Promise.resolve();
  let savedFiles: WorkbenchFiles = {};
  let observedFiles: WorkbenchFiles = {};
  let observedDirectories = new Set<string>();
  let project: ProjectExecution | undefined;
  let projectShell: ProjectShell | undefined;
  let projectSize: TerminalSize = { cols: 80, rows: 24 };
  const outputAbort = new AbortController();

  const report = (cause: unknown): void => {
    if (!disposed) options.onError(cause);
  };
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tasks.then(operation);
    tasks = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  function release(): void {
    container?.teardown();
    container = undefined;
    releaseContainer?.();
    releaseContainer = undefined;
  }

  function closeWatchers(): void {
    watcher?.close();
    watcher = undefined;
    removeServerListener?.();
    removeServerListener = undefined;
  }

  function killProcess(): void {
    if (!process || killed) return;
    killed = true;
    process.kill();
  }

  function killProjectShell(shell: ProjectShell): void {
    if (shell.killed || shell.exited) return;
    shell.killed = true;
    shell.process.kill();
  }

  function closeInput(writer: WritableStreamDefaultWriter<string>): void {
    void writer
      .abort()
      .catch(() => undefined)
      .then(() => {
        writer.releaseLock();
      });
  }

  function closeProjectInput(shell: ProjectShell): void {
    if (shell.inputClosed) return;
    shell.inputClosed = true;
    closeInput(shell.input);
  }

  const wake = (shell: ProjectShell): void => shell.waiters.forEach(check => check());

  /** 等项目终端满足条件；终端已退出或运行时已释放时得到 false。 */
  function until(shell: ProjectShell, ready: () => boolean): Promise<boolean> {
    return new Promise(resolve => {
      const check = (): void => {
        const gone = disposed || shell.exited;
        if (!gone && !ready()) return;
        shell.waiters.delete(check);
        resolve(!gone);
      };
      shell.waiters.add(check);
      check();
    });
  }

  /** 停止或释放：取消进行中的运行，杀掉项目终端。 */
  function cancelProject(): void {
    if (project) project.cancelled = true;
    if (projectShell) killProjectShell(projectShell);
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    closeWatchers();
    outputAbort.abort();
    killProcess();
    cancelProject();
    if (projectShell) {
      projectShell.outputAbort.abort();
      closeProjectInput(projectShell);
      wake(projectShell);
    }
    if (input) closeInput(input);
    input = undefined;
    if (container) release();
  }

  async function waitForExit(exit: Promise<unknown>): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        exit,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('终端进程停止超时，请重试')), 5000);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  function setProjectState(
    execution: ProjectExecution,
    state: 'installing' | 'running' | 'stopped',
    code?: number
  ): void {
    if (disposed || stopping || project !== execution) return;
    if (state === 'stopped') options.onProjectState?.(state, code);
    else options.onProjectState?.(state);
  }

  function finishProject(execution: ProjectExecution, code: number): void {
    execution.active = false;
    setProjectState(execution, 'stopped', execution.cancelled ? 130 : code);
  }

  async function drainProjectOutput(shell: ProjectShell): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        shell.outputDone,
        new Promise<void>(resolve => {
          timeout = setTimeout(() => {
            shell.outputAbort.abort();
            resolve();
          }, 500);
        })
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 项目终端退出：排空剩余输出再报告 exited，下次运行重新启动终端。 */
  async function closeProjectShell(shell: ProjectShell, code: number): Promise<void> {
    shell.exited = true;
    closeProjectInput(shell);
    wake(shell);
    await drainProjectOutput(shell);
    if (projectShell !== shell) return;
    projectShell = undefined;
    if (project) project.active = false;
    if (!disposed && !stopping) options.onProjectState?.('exited', code);
  }

  async function openProjectShell(): Promise<ProjectShell> {
    if (!container) throw new Error('终端尚未启动');
    const child = await container.spawn('jsh', ['--osc'], { terminal: projectSize, env: PROJECT_ENV });
    if (disposed || stopping) {
      child.kill();
      throw new Error('终端已停止');
    }
    const shell: ProjectShell = {
      process: child,
      input: child.input.getWriter(),
      outputAbort: new AbortController(),
      waiters: new Set(),
      outputDone: Promise.resolve(),
      partial: '',
      interactive: false,
      idle: false,
      started: false,
      status: 0,
      killed: false,
      exited: false,
      inputClosed: false
    };
    projectShell = shell;
    shell.outputDone = child.output
      .pipeTo(
        new WritableStream<string>({
          write(data) {
            if (disposed || projectShell !== shell) return;
            options.onProjectOutput?.(data);
            shell.partial = parseMarkers(shell.partial + data, marker => readMarker(shell, marker));
            wake(shell);
          }
        }),
        detachOutput(shell.outputAbort.signal)
      )
      .catch(cause => {
        if (!shell.outputAbort.signal.aborted && projectShell === shell) report(cause);
      });
    void child.exit.then(code => closeProjectShell(shell, code), report);
    return shell;
  }

  /** 像用户一样在提示符后输入命令，回显、耗时与提示符都由 jsh 输出。 */
  async function typeCommand(shell: ProjectShell, command: string): Promise<void> {
    shell.idle = false;
    shell.started = false;
    await shell.input.write(`${command}\r`);
  }

  /** 等刚输入的命令结束并回到提示符；终端先退出时得到 false。 */
  const commandSettled = (shell: ProjectShell): Promise<boolean> => until(shell, () => shell.started && shell.idle);

  async function executeProject(
    execution: ProjectExecution,
    plan: TerminalProjectPlan,
    accept: () => void,
    reject: (cause: unknown) => void
  ): Promise<void> {
    const halted = (): boolean => disposed || stopping || execution.cancelled;
    let ready = false;
    try {
      await started;
      // 退出的终端可能还在排空输出，不必等它报告 exited，直接换新终端
      const shell = projectShell && !projectShell.exited ? projectShell : await openProjectShell();
      const usable = await until(shell, () => shell.interactive);
      if (halted()) {
        accept();
        return finishProject(execution, 130);
      }
      if (!usable) throw new Error('项目终端已退出，请重新运行');
      if (!shell.idle) throw new Error('项目终端正在执行命令，请先结束当前命令再运行');
      setProjectState(execution, 'installing');
      await typeCommand(shell, installCommand(plan));
      accept();
      ready = true;
      if (!(await commandSettled(shell))) return;
      if (halted() || shell.status !== 0) return finishProject(execution, shell.status);
      await typeCommand(shell, startCommand(plan));
      if (!halted()) setProjectState(execution, 'running');
      if (await commandSettled(shell)) finishProject(execution, shell.status);
    } catch (cause) {
      finishProject(execution, -1);
      if (halted()) return accept();
      if (ready) report(cause);
      else reject(cause);
    }
  }

  function runProject(plan: TerminalProjectPlan): Promise<void> {
    if (disposed) return Promise.reject(new Error('终端已释放'));
    if (stopping) return Promise.reject(new Error('终端正在停止'));
    if (project?.active) return project.ready;
    let accept!: () => void;
    let reject!: (cause: unknown) => void;
    const ready = new Promise<void>((resolve, decline) => {
      accept = resolve;
      reject = decline;
    });
    const execution: ProjectExecution = { ready, done: Promise.resolve(), active: true, cancelled: false };
    project = execution;
    execution.done = executeProject(execution, plan, accept, reject);
    return ready;
  }

  async function readFiles(): Promise<WorkbenchFiles> {
    if (!container) return observedFiles;
    const fs = container.fs;
    const next: Record<string, string | Uint8Array> = Object.create(null) as Record<string, string | Uint8Array>;
    const directories = new Set<string>();
    let count = 0;
    let totalBytes = 0;
    const visit = async (directory: string): Promise<void> => {
      if (directory) directories.add(directory);
      const entries = await fs.readdir(directory || '.', { withFileTypes: true });
      for (const entry of entries) {
        const path = directory ? `${directory}/${entry.name}` : entry.name;
        if (ignoredPath(path) || (!entry.isDirectory() && !entry.isFile())) continue;
        assertGitPath(path);
        if (entry.isDirectory()) await visit(path);
        if (entry.isFile()) await readFile(path);
      }
    };
    const readFile = async (path: string): Promise<void> => {
      if (++count > GIT_WORKBENCH_LIMITS.files) throw new Error('Project file count exceeds limit');
      const bytes = await fs.readFile(path);
      totalBytes += bytes.length;
      if (bytes.length > GIT_WORKBENCH_LIMITS.fileBytes || totalBytes > GIT_WORKBENCH_LIMITS.totalBytes)
        throw new Error(`Project file bytes exceed limit: ${path}`);
      next[path] = decodeFileBytes(path, bytes);
    };
    await visit('');
    assertNoPathCollisions(Object.keys(next));
    observedDirectories = directories;
    return next;
  }

  async function scan(): Promise<Set<string>> {
    const changed = new Set<string>();
    if (disposed || !container) return changed;
    let next: WorkbenchFiles;
    try {
      next = await readFiles();
    } catch (cause) {
      if (disposed) return changed;
      throw cause;
    }
    if (disposed) return changed;
    const writes = Object.fromEntries(
      Object.entries(next).filter(([path, value]) => !sameFile(observedFiles[path], value))
    );
    const removed = Object.keys(observedFiles).filter(path => !Object.hasOwn(next, path));
    const paths = [...Object.keys(writes), ...removed];
    if (!paths.length) return changed;
    try {
      await options.onFiles(writes, removed);
    } catch (cause) {
      if (disposed) return changed;
      throw cause;
    }
    if (disposed) return changed;
    observedFiles = next;
    paths.forEach(path => changed.add(path));
    return changed;
  }

  function scheduleScan(path: string): void {
    if (disposed || ignoredPath(path)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch(report);
    }, 150);
  }

  async function boot(): Promise<TerminalContainer> {
    if (options.boot) return options.boot();
    if (!globalThis.crossOriginIsolated) throw new Error('终端需要跨源隔离，请配置 COOP / COEP 响应头');
    const api = await import('@webcontainer/api');
    if (options.apiKey && configuredAPIKey !== options.apiKey) {
      if (webContainerBootCalled) throw new Error('WebContainer 授权配置已改变，请刷新页面后重新启动终端');
      api.configureAPIKey(options.apiKey);
      configuredAPIKey = options.apiKey;
    }
    webContainerBootCalled = true;
    return api.WebContainer.boot({ coep: 'require-corp', workdirName: 'project' });
  }

  async function initialize(snapshot: WorkbenchSnapshot, size: TerminalSize): Promise<void> {
    const previous = availableContainer;
    availableContainer = new Promise<void>(resolve => {
      releaseContainer = resolve;
    });
    await previous;
    if (disposed) return release();
    try {
      container = await boot();
      if (disposed) return release();
      savedFiles = filteredFiles(snapshot.files);
      observedFiles = savedFiles;
      await container.mount(fileTree(savedFiles));
      if (disposed) return release();
      removeServerListener = container.on('server-ready', (port, url) => {
        if (!disposed) options.onServerReady(port, url);
      });
      watcher = container.fs.watch('.', { recursive: true }, (_event, filename) => {
        scheduleScan(typeof filename === 'string' ? filename : new TextDecoder().decode(filename));
      });
      process = await container.spawn('jsh', [], { terminal: size });
      if (disposed) {
        killProcess();
        return release();
      }
      input = process.input.getWriter();
      void process.output
        .pipeTo(
          new WritableStream<string>({
            write(data) {
              if (!disposed) options.onOutput(data);
            }
          }),
          detachOutput(outputAbort.signal)
        )
        .catch(report);
      void process.exit
        .then(code => {
          if (!disposed && !stopping) options.onExit(code);
        })
        .catch(report);
    } catch (cause) {
      closeWatchers();
      release();
      if (!disposed) throw cause;
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    return enqueue(async () => {
      await started;
      await scan();
    });
  }

  return {
    start(snapshot, size) {
      if (disposed) return Promise.reject(new Error('终端已释放'));
      if (projectId && projectId !== snapshot.projectId) return Promise.reject(new Error('终端已绑定其他项目'));
      projectId = snapshot.projectId;
      projectSize = size;
      return (started ??= initialize(snapshot, size));
    },
    async write(data) {
      if (disposed) throw new Error('终端已释放');
      await started;
      if (disposed) throw new Error('终端已释放');
      if (!input) throw new Error('终端尚未启动');
      await input.write(data);
    },
    resize(size) {
      if (!disposed) process?.resize(size);
    },
    runProject,
    async writeProject(data) {
      if (disposed) throw new Error('终端已释放');
      if (data.includes('\u0003') && project?.active) project.cancelled = true;
      const shell = projectShell;
      // 项目终端还在启动或已经退出时没有接收方，Ctrl+C 只用于取消运行
      if (shell && !shell.exited) await shell.input.write(data);
    },
    resizeProject(size) {
      projectSize = size;
      if (!disposed) projectShell?.process.resize(size);
    },
    sync(snapshot) {
      return enqueue(async () => {
        await started;
        if (disposed) return;
        if (snapshot.projectId !== projectId) throw new Error('不能向终端同步其他项目的文件');
        if (!container) throw new Error('终端尚未启动');
        const next = filteredFiles(snapshot.files);
        const conflicts = await scan();
        if (disposed || !container) return;
        const conflicted = (path: string): boolean => [...conflicts].some(changed => overlappingPath(path, changed));
        const desiredWrites = Object.entries(next).filter(([path, value]) => !sameFile(savedFiles[path], value));
        const protectedPaths = desiredWrites.map(([path]) => path).filter(conflicted);
        const protectedPath = (path: string): boolean =>
          conflicted(path) || protectedPaths.some(protectedRoot => overlappingPath(path, protectedRoot));
        const writes = desiredWrites.filter(
          ([path, value]) => !sameFile(observedFiles[path], value) && !protectedPath(path)
        );
        const removed = Object.keys(savedFiles).filter(
          path => !Object.hasOwn(next, path) && Object.hasOwn(observedFiles, path) && !protectedPath(path)
        );
        const directories = writes.map(([path]) => path).filter(path => observedDirectories.has(path));
        const protectedDirectory = directories.find(directory =>
          Object.keys(observedFiles).some(path => path.startsWith(`${directory}/`) && !removed.includes(path))
        );
        if (protectedDirectory) throw new Error(`终端目录仍包含未同步文件：${protectedDirectory}`);
        const fs = container.fs;
        try {
          for (const path of removed) {
            if (disposed) return;
            await fs.rm(path, { force: true });
          }
          for (const path of directories) {
            if (disposed) return;
            await fs.rm(path, { force: true, recursive: true });
          }
          for (const [path, value] of writes) {
            if (disposed) return;
            const parent = path.split('/').slice(0, -1).join('/');
            if (parent) await fs.mkdir(parent, { recursive: true });
            if (!disposed) await fs.writeFile(path, value);
          }
        } catch (cause) {
          if (disposed) return;
          throw cause;
        }
        const observed = { ...observedFiles };
        removed.forEach(path => {
          delete observed[path];
        });
        writes.forEach(([path, value]) => {
          observed[path] = value;
        });
        observedFiles = observed;
        savedFiles = next;
      });
    },
    flush,
    stop() {
      if (disposed) return Promise.resolve();
      if (stoppingPromise) return stoppingPromise;
      stopping = true;
      stoppingPromise = (async () => {
        if (!process) return dispose();
        const shell = projectShell;
        killProcess();
        cancelProject();
        await waitForExit(Promise.all([process.exit, shell?.process.exit, project?.done]));
        await flush();
        dispose();
      })().finally(() => {
        stopping = false;
        stoppingPromise = undefined;
      });
      return stoppingPromise;
    },
    dispose
  };
}
