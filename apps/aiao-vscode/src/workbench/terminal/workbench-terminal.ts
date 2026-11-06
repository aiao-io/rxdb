import type { WorkbenchSession } from '../session.js';
import { createTerminalView, type TerminalView } from './terminal-view.js';
import { createWebContainerRuntime, type TerminalRuntime, type TerminalRuntimeOptions } from './webcontainer-runtime.js';

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
  flush(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
  fit(): void;
  dispose(): void;
}

/** 懒启动项目 Shell，把文件回执与进程生命周期绑定到当前项目。 */
export function createWorkbenchTerminal(host: HTMLElement, options: WorkbenchTerminalOptions): WorkbenchTerminal {
  const { session } = options;
  const document = host.ownerDocument;
  host.classList.add('wb-terminal');
  host.innerHTML = '<div class="wb-panel-toolbar"><span>Node.js</span><span data-terminal-status role="status">尚未启动</span><span class="wb-spacer"></span><span data-terminal-servers></span><button data-terminal-action="start" title="启动或重新连接终端" aria-label="启动终端">启动</button><button data-terminal-action="clear" title="清空终端显示" aria-label="清空终端">清空</button><button data-terminal-action="stop" title="停止终端与项目进程" aria-label="停止终端">停止</button></div><div class="wb-terminal-message">打开终端，运行 node、npm 或 pnpm 命令。编辑器保存后同步到终端。</div><div class="wb-terminal-content" data-workbench-terminal></div>';
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
  let starting: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let epoch = 0;
  let disposed = false;
  let exited = false;
  let savedRevision = '';
  let pendingRevision = '';
  let projectId = session.state.projectId;

  const active = (current: number): boolean => !disposed && current === epoch;
  const report = (current: number, cause: unknown): void => { if (active(current)) failure(cause); };

  function reset(): void {
    epoch++;
    runtime?.dispose();
    runtime = undefined;
    view?.dispose();
    view = undefined;
    starting = undefined;
    closing = undefined;
    exited = false;
    savedRevision = '';
    pendingRevision = '';
    servers.replaceChildren();
    content.replaceChildren();
    message.hidden = false;
    status.textContent = '尚未启动';
    options.onStop();
  }

  function failure(cause: unknown): void {
    if (disposed) return;
    status.textContent = '终端错误';
    message.textContent = cause instanceof Error ? cause.message : String(cause);
    message.hidden = false;
    options.onError(cause);
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

  function syncSaved(): Promise<void> {
    const run = runtime;
    if (!run || exited || !session.state.projectId) return Promise.resolve();
    const snapshot = session.getSavedSnapshot();
    if (pendingRevision === snapshot.revision || savedRevision === snapshot.revision) return Promise.resolve();
    const current = epoch;
    pendingRevision = snapshot.revision;
    return run.sync(snapshot).then(() => {
      if (!active(current)) return;
      savedRevision = snapshot.revision;
      if (!exited && !starting) {
        status.textContent = '运行中';
        message.hidden = true;
      }
    }).catch(cause => { report(current, cause); }).finally(() => {
      if (active(current) && pendingRevision === snapshot.revision) pendingRevision = '';
    });
  }

  function shellExit(current: number, code: number): void {
    if (!active(current) || exited) return;
    exited = true;
    status.textContent = `已退出 (${code})`;
    message.textContent = 'Shell 已退出。点击启动可重新打开终端。';
    message.hidden = false;
    const run = runtime;
    if (!run) return;
    closing = run.flush().then(() => {
      if (!active(current) || runtime !== run) return;
      run.dispose();
      runtime = undefined;
      servers.replaceChildren();
      options.onStop();
    }).catch(cause => { report(current, cause); }).finally(() => {
      if (active(current)) closing = undefined;
    });
  }

  async function start(current: number, id: string): Promise<void> {
    const isCurrent = () => active(current) && id === session.state.projectId;
    const screen = document.createElement('div');
    screen.className = 'wb-terminal-instance';
    content.replaceChildren(screen);
    status.textContent = '正在启动 Node.js…';
    message.hidden = true;
    try {
      const mounted = await (options.createView ?? createTerminalView)(screen, {
        onData(data) {
          if (isCurrent() && !exited) void runtime?.write(data).catch(cause => report(current, cause));
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
        onOutput(data) { if (isCurrent()) mounted.write(data); },
        async onFiles(files, removedPaths) {
          if (!isCurrent()) return;
          await session.applyExternalFiles(files, removedPaths);
          if (isCurrent()) options.onFilesChanged?.();
        },
        onServerReady(port, url) {
          if (!isCurrent()) return;
          try { serverReady(port, url); } catch (cause) { report(current, cause); }
        },
        onError(cause) { report(current, cause); },
        onExit(code) { shellExit(current, code); }
      });
      runtime = run;
      const snapshot = session.getSavedSnapshot();
      savedRevision = snapshot.revision;
      await run.start(snapshot, { cols: mounted.cols, rows: mounted.rows });
      if (!isCurrent() || exited) return;
      status.textContent = '运行中';
      mounted.fit();
      mounted.focus();
    } catch (cause) {
      if (!isCurrent()) return;
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
    await closing;
    if (disposed) return;
    if (exited) await stop();
    const id = session.state.projectId;
    if (!id) {
      message.textContent = '请先打开一个项目，再启动终端。';
      message.hidden = false;
      return;
    }
    if (starting) return starting;
    if (runtime) {
      const current = epoch;
      await syncSaved();
      if (!active(current)) return;
      view?.fit();
      view?.focus();
      return;
    }
    view?.dispose();
    const current = ++epoch;
    starting = start(current, id).finally(() => {
      if (active(current)) starting = undefined;
    });
    return starting;
  }

  async function stop(): Promise<void> {
    if (disposed) return;
    const current = epoch;
    const run = runtime;
    if (!starting && run) {
      try { await run.stop(); } catch (cause) {
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
    void syncSaved();
  });
  const click = (event: Event) => {
    const action = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-terminal-action]')?.dataset['terminalAction'] : undefined;
    const current = epoch;
    if (action === 'start') void show().catch(cause => report(current, cause));
    if (action === 'clear') view?.clear();
    if (action === 'stop') void stop().catch(cause => report(current, cause));
  };
  host.addEventListener('click', click);
  return {
    show,
    flush: async () => { await starting; await closing; await runtime?.flush(); },
    stop,
    clear: () => view?.clear(),
    fit: () => view?.fit(),
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
      reset();
      host.removeEventListener('click', click);
    }
  };
}
