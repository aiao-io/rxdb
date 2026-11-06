import type { WorkbenchSession } from '../session.js';
import { projectRunPlan } from './project-command.js';
import { createTerminalView, type TerminalView } from './terminal-view.js';
import {
  createWebContainerRuntime,
  type TerminalRuntime,
  type TerminalRuntimeOptions
} from './webcontainer-runtime.js';

/** 项目终端与工作台之间的事件和可替换实现。 */
export interface WorkbenchTerminalOptions {
  readonly session: WorkbenchSession;
  readonly apiKey?: string;
  readonly onPreview: (port: number, url: string) => void;
  readonly onStop: () => void;
  readonly onError: (cause: unknown) => void;
  readonly onFilesChanged?: () => void;
  readonly createRuntime?: (options: TerminalRuntimeOptions) => TerminalRuntime;
  readonly createView?: typeof createTerminalView;
}

/** 关闭面板保留进程，停止或切换项目释放容器。 */
export interface WorkbenchTerminal {
  show(): Promise<void>;
  runProject(): Promise<void>;
  flush(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
  fit(): void;
  dispose(): void;
}

type TerminalSession = 'shell' | 'project';

/** 懒启动项目 Shell，把文件回执与进程生命周期绑定到当前项目。 */
export function createWorkbenchTerminal(host: HTMLElement, options: WorkbenchTerminalOptions): WorkbenchTerminal {
  const { session } = options;
  const document = host.ownerDocument;
  host.classList.add('wb-terminal');
  host.innerHTML =
    '<div class="wb-panel-toolbar"><button data-terminal-session="shell" aria-pressed="true">Shell</button><button data-terminal-session="project" aria-pressed="false">项目</button><span data-terminal-status role="status">尚未启动</span><span class="wb-spacer"></span><span data-terminal-servers></span><button data-terminal-action="start" title="启动或重新连接终端" aria-label="启动终端">启动</button><button data-terminal-action="clear" title="清空终端显示" aria-label="清空终端">清空</button><button data-terminal-action="stop" title="停止终端与项目进程" aria-label="停止终端">停止</button></div><div class="wb-terminal-message">打开终端，运行 node、npm 或 pnpm 命令。编辑器保存后同步到终端。</div><div class="wb-terminal-content" data-workbench-terminal></div>';
  const required = <T extends HTMLElement>(selector: string): T => {
    const element = host.querySelector<T>(selector);
    if (!element) throw new Error(`终端布局缺少 ${selector}`);
    return element;
  };
  const status = required('[data-terminal-status]');
  const message = required('.wb-terminal-message');
  const content = required('.wb-terminal-content');
  const servers = required('[data-terminal-servers]');
  let runtime: TerminalRuntime | undefined;
  let view: TerminalView | undefined;
  let projectView: TerminalView | undefined;
  let starting: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let syncing: Promise<void> | undefined;
  let projectOpening: Promise<void> | undefined;
  let projectStarting: Promise<void> | undefined;
  let epoch = 0;
  let generation = 0;
  let projectRequest = 0;
  let disposed = false;
  let exited = false;
  let projectBusy = false;
  let projectLaunched = false;
  /** 项目终端已在运行时里启动，运行结束后仍接收输入，直到它退出。 */
  let projectTerminal = false;
  let savedRevision = '';
  let projectId = session.state.projectId;
  let selected: TerminalSession = 'shell';
  let shellStatus = '尚未启动';
  let projectStatus = '尚未运行';
  let bootFailure: unknown;
  const conflicts = new Set<string>();

  const active = (current: number): boolean => !disposed && current === epoch;
  const selectedView = (): TerminalView | undefined => (selected === 'shell' ? view : projectView);
  const updateStatus = (): void => {
    status.textContent = selected === 'shell' ? shellStatus : projectStatus;
  };
  const report = (current: number, cause: unknown): void => {
    if (active(current)) failure(cause);
  };
  const focus = (): void => {
    selectedView()?.fit();
    selectedView()?.focus();
  };

  function select(next: TerminalSession): void {
    selected = next;
    for (const button of host.querySelectorAll<HTMLElement>('[data-terminal-session]'))
      button.setAttribute('aria-pressed', String(button.dataset['terminalSession'] === next));
    for (const screen of content.querySelectorAll<HTMLElement>('[data-terminal-session-view]'))
      screen.hidden = screen.dataset['terminalSessionView'] !== next;
    updateStatus();
    focus();
  }

  function createScreen(kind: TerminalSession): HTMLElement {
    const screen = document.createElement('div');
    screen.className = 'wb-terminal-instance';
    screen.dataset['terminalSessionView'] = kind;
    screen.hidden = selected !== kind;
    content.append(screen);
    return screen;
  }

  function reset(): void {
    epoch++;
    projectRequest++;
    runtime?.dispose();
    runtime = undefined;
    view?.dispose();
    view = undefined;
    projectView?.dispose();
    projectView = undefined;
    starting = undefined;
    closing = undefined;
    syncing = undefined;
    projectOpening = undefined;
    projectStarting = undefined;
    exited = false;
    projectBusy = false;
    projectLaunched = false;
    projectTerminal = false;
    savedRevision = '';
    bootFailure = undefined;
    conflicts.clear();
    servers.replaceChildren();
    content.replaceChildren();
    message.hidden = false;
    shellStatus = '尚未启动';
    projectStatus = '尚未启动';
    updateStatus();
    options.onStop();
  }

  function notifyFailure(cause: unknown): void {
    if (disposed) return;
    message.textContent = cause instanceof Error ? cause.message : String(cause);
    message.hidden = false;
    options.onError(cause);
  }

  function failure(cause: unknown): void {
    shellStatus = '终端错误';
    updateStatus();
    notifyFailure(cause);
  }

  function writeProjectError(cause: unknown): void {
    projectView?.write(`\r\n${cause instanceof Error ? cause.message : String(cause)}\r\n`);
  }

  function projectFailure(cause: unknown): void {
    projectBusy = false;
    projectLaunched = false;
    projectStatus = '项目启动失败';
    writeProjectError(cause);
    updateStatus();
    notifyFailure(cause);
  }

  function serverReady(port: number, address: string): void {
    const url = new URL(address);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin === location.origin || url.username || url.password)
      throw new Error('项目服务必须使用独立的 HTTP 来源');
    let button = servers.querySelector<HTMLButtonElement>(`[data-server-port="${port}"]`);
    if (!button) {
      button = document.createElement('button');
      button.dataset['serverPort'] = String(port);
      servers.append(button);
    }
    button.textContent = `预览 :${port}`;
    button.title = url.href;
    button.onclick = () => options.onPreview(port, url.href);
    options.onPreview(port, url.href);
  }

  function showConflicts(): void {
    message.textContent = `终端更新了 ${[...conflicts].join('、')}；编辑器未保存内容已保留。`;
    message.hidden = false;
  }

  function syncSaved(): Promise<void> {
    const run = runtime;
    if (!run || exited || !session.state.projectId) return Promise.resolve();
    if (syncing) return syncing.then(syncSaved);
    const snapshot = session.getSavedSnapshot();
    if (savedRevision === snapshot.revision) return Promise.resolve();
    const current = epoch;
    const task = run
      .sync(snapshot)
      .then(() => {
        if (!active(current) || runtime !== run) return;
        savedRevision = snapshot.revision;
        if (exited || starting) return;
        shellStatus = '运行中';
        updateStatus();
        if (conflicts.size) showConflicts();
        else message.hidden = true;
      })
      .finally(() => {
        if (syncing === task) syncing = undefined;
      });
    syncing = task;
    return task.then(syncSaved);
  }

  function shellExit(current: number, code: number): void {
    if (!active(current) || exited) return;
    exited = true;
    projectRequest++;
    projectBusy = false;
    projectLaunched = false;
    projectTerminal = false;
    shellStatus = `已退出 (${code})`;
    projectStatus = '项目已停止';
    updateStatus();
    message.textContent = 'Shell 已退出。点击启动可重新打开终端。';
    message.hidden = false;
    const run = runtime;
    if (!run) return;
    closing = run
      .flush()
      .then(() => {
        if (!active(current) || runtime !== run) return;
        run.dispose();
        runtime = undefined;
        servers.replaceChildren();
        options.onStop();
      })
      .catch(cause => {
        report(current, cause);
      })
      .finally(() => {
        if (active(current)) closing = undefined;
      });
  }

  async function start(current: number, id: string): Promise<void> {
    const runtimeGeneration = ++generation;
    const isCurrent = () => active(current) && runtimeGeneration === generation && id === session.state.projectId;
    view?.dispose();
    content.querySelector('[data-terminal-session-view="shell"]')?.remove();
    const screen = createScreen('shell');
    shellStatus = '正在启动 Node.js…';
    updateStatus();
    message.hidden = true;
    bootFailure = undefined;
    try {
      const mounted = await (options.createView ?? createTerminalView)(screen, {
        onData(data) {
          if (isCurrent() && !exited)
            void runtime?.write(data).catch(cause => {
              if (isCurrent()) failure(cause);
            });
        },
        onResize(size) {
          if (isCurrent()) runtime?.resize(size);
        }
      });
      if (!isCurrent()) {
        mounted.dispose();
        return;
      }
      view = mounted;
      const run = (options.createRuntime ?? createWebContainerRuntime)({
        apiKey: options.apiKey,
        onOutput(data) {
          if (isCurrent()) mounted.write(data);
        },
        onProjectOutput(data) {
          if (isCurrent()) projectView?.write(data);
        },
        onProjectState(state, exitCode) {
          if (!isCurrent()) return;
          const code = exitCode === undefined ? '' : ` (${exitCode})`;
          projectBusy = state === 'installing' || state === 'running';
          projectLaunched = projectBusy;
          if (state === 'exited') projectTerminal = false;
          projectStatus = {
            installing: '安装依赖',
            running: '项目运行中',
            stopped: `项目已停止${code}`,
            exited: `项目终端已退出${code}`
          }[state];
          updateStatus();
        },
        async onFiles(files, removedPaths) {
          if (!isCurrent()) return;
          await session.applyExternalFiles(files, removedPaths);
          if (!isCurrent()) return;
          for (const path of [...Object.keys(files), ...removedPaths])
            if (session.isModified(path)) conflicts.add(path);
          if (conflicts.size) showConflicts();
          options.onFilesChanged?.();
        },
        onServerReady(port, url) {
          if (!isCurrent()) return;
          try {
            serverReady(port, url);
          } catch (cause) {
            report(current, cause);
          }
        },
        onError(cause) {
          if (!isCurrent()) return;
          if (projectBusy) writeProjectError(cause);
          failure(cause);
        },
        onExit(code) {
          if (isCurrent()) shellExit(current, code);
        }
      });
      runtime = run;
      const snapshot = session.getSavedSnapshot();
      savedRevision = snapshot.revision;
      await run.start(snapshot, { cols: mounted.cols, rows: mounted.rows });
      if (!isCurrent() || exited) return;
      await syncSaved();
      if (!isCurrent() || exited) return;
      shellStatus = '运行中';
      updateStatus();
      mounted.fit();
    } catch (cause) {
      if (!isCurrent()) return;
      bootFailure = cause;
      runtime?.dispose();
      runtime = undefined;
      view?.dispose();
      view = undefined;
      screen.remove();
      failure(cause);
    }
  }

  async function show(): Promise<void> {
    if (disposed) return;
    const current = epoch;
    const id = session.state.projectId;
    const isCurrent = () => active(current) && id === session.state.projectId;
    if (closing) await closing;
    if (!isCurrent()) return;
    if (exited && runtime) {
      const run = runtime;
      await run.flush();
      if (!isCurrent() || runtime !== run) return;
      run.dispose();
      runtime = undefined;
      servers.replaceChildren();
      options.onStop();
    }
    exited = false;
    if (!id) {
      message.textContent = '请先打开一个项目，再启动终端。';
      message.hidden = false;
      return;
    }
    if (!starting && !runtime) {
      starting = start(current, id).finally(() => {
        if (active(current)) starting = undefined;
      });
    }
    if (starting) await starting;
    else await syncSaved();
    if (isCurrent()) focus();
  }

  function projectInput(current: number, data: string): void {
    if (!active(current)) return;
    if (data.includes('\u0003') && projectBusy && !projectLaunched) {
      projectRequest++;
      projectBusy = false;
      projectStatus = '项目已停止';
      // 项目终端还没启动时没有进程回显 ^C；已启动的终端会自己回显并换新提示符
      if (!projectTerminal) projectView?.write('^C\r\n');
      updateStatus();
    }
    const run = runtime;
    const runtimeGeneration = generation;
    if (!projectTerminal || exited || !run) return;
    void run.writeProject(data).catch(cause => {
      if (!active(current) || generation !== runtimeGeneration || runtime !== run) return;
      writeProjectError(cause);
      failure(cause);
    });
  }

  async function openProjectView(current: number): Promise<void> {
    if (projectView) return;
    if (projectOpening) return projectOpening;
    const screen = createScreen('project');
    const opening = (options.createView ?? createTerminalView)(screen, {
      onData: data => projectInput(current, data),
      onResize(size) {
        if (active(current)) runtime?.resizeProject(size);
      }
    })
      .then(mounted => {
        if (!active(current)) {
          mounted.dispose();
          return;
        }
        projectView = mounted;
        focus();
      })
      .finally(() => {
        if (projectOpening === opening) projectOpening = undefined;
      });
    projectOpening = opening;
    return opening;
  }

  function runProject(): Promise<void> {
    if (disposed) return Promise.resolve();
    select('project');
    if (projectBusy) return projectStarting ?? Promise.resolve();
    const current = epoch;
    const id = session.state.projectId;
    const request = ++projectRequest;
    const isCurrent = () => active(current) && id === session.state.projectId && request === projectRequest;
    projectBusy = true;
    projectStatus = '正在准备项目…';
    if (!conflicts.size) message.hidden = true;
    updateStatus();
    const opening = show();
    const task = Promise.all([opening, openProjectView(current)])
      .then(async () => {
        if (!isCurrent()) return;
        if (!runtime) throw bootFailure ?? new Error('请先打开项目并启动终端');
        await syncSaved();
        if (!isCurrent()) return;
        const plan = projectRunPlan(session.getSavedSnapshot().files);
        projectLaunched = true;
        projectTerminal = true;
        runtime.resizeProject({ cols: projectView?.cols ?? 80, rows: projectView?.rows ?? 24 });
        await runtime.runProject(plan);
        if (isCurrent()) focus();
      })
      .catch(cause => {
        if (!isCurrent()) return;
        projectFailure(cause);
        throw cause;
      })
      .finally(() => {
        if (projectStarting === task) projectStarting = undefined;
      });
    projectStarting = task;
    return task;
  }

  async function stop(): Promise<void> {
    if (disposed) return;
    projectRequest++;
    projectBusy = false;
    projectLaunched = false;
    const current = epoch;
    const run = runtime;
    if (!starting && run) {
      try {
        await run.stop();
      } catch (cause) {
        if (!active(current)) return;
        exited = true;
        throw cause;
      }
      if (active(current) && runtime === run) runtime = undefined;
    }
    if (!active(current)) return;
    reset();
    message.textContent = '终端已停止。点击启动重新打开。';
  }

  const release = session.subscribe(state => {
    if (state.projectId !== projectId) {
      reset();
      projectId = state.projectId;
    }
    for (const path of conflicts) if (!session.isModified(path)) conflicts.delete(path);
    if (!conflicts.size && shellStatus === '运行中') message.hidden = true;
    const current = epoch;
    const run = runtime;
    const runtimeGeneration = generation;
    void syncSaved().catch(cause => {
      if (active(current) && runtime === run && generation === runtimeGeneration) failure(cause);
    });
  });
  const click = (event: Event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-terminal-session]');
    const next = button?.dataset['terminalSession'];
    if (next === 'shell' || next === 'project') select(next);
    const action = event.target.closest<HTMLElement>('[data-terminal-action]')?.dataset['terminalAction'];
    const current = epoch;
    if (action === 'start') void show().catch(cause => report(current, cause));
    if (action === 'clear') selectedView()?.clear();
    if (action === 'stop') void stop().catch(cause => report(current, cause));
  };
  host.addEventListener('click', click);
  return {
    show,
    runProject,
    flush: async () => {
      await starting;
      await closing;
      await syncing;
      await runtime?.flush();
    },
    stop,
    clear: () => selectedView()?.clear(),
    fit: () => selectedView()?.fit(),
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      reset();
      host.removeEventListener('click', click);
    }
  };
}
