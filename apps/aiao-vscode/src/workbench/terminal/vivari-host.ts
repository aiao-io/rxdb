import type { Vivari } from '@vivari/core';
import { WATCH_EVENT, watchScript } from './project-watcher.js';
import { PROJECT_ROOT, acceptHostConnection, projectPath } from './runtime-host-page.js';
import {
  serveRuntimeHost,
  type RuntimeHostBackend,
  type RuntimeHostEntry,
  type RuntimeHostProcessEvents
} from './runtime-host-protocol.js';
import { SYNC_IGNORED_DIRECTORIES } from './sync-ignore.js';

/** 宿主用到的 vivari 实例能力。 */
export type VivariInstance = Pick<Vivari, 'fs' | 'mount' | 'spawn' | 'on' | 'attachPreview' | 'teardown'>;

/** 预览容器页从内核宿主页窗口上取用的接口（两页同源，直接调用）。 */
export interface VivariPreviewHost {
  attachPreview(frame: HTMLIFrameElement): () => void;
}

/** 内核宿主页把 {@link VivariPreviewHost} 挂在自己的窗口上。 */
type VivariHostWindow = Window & { aiaoVivariHost?: VivariPreviewHost };

/** vivari 同源预览（mode A）的服务地址：`/preview/<port>/…`。 */
const PREVIEW_PATH = /^\/preview\/\d+\//;
/** 工作台给内核宿主 iframe 起的名字前缀，见 runtime-host-frame。 */
const KERNEL_HOST_NAME = 'aiao-runtime-host-vivari-';

/**
 * 服务预览改走宿主源上的预览容器页：vivari 的热更新隧道要求预览 iframe 的父窗口能转发给内核，
 * 工作台跨源转发不了，容器页与内核宿主页同源，可以直接接上。
 */
export function previewFrameUrl(location: Pick<Location, 'origin'>, hostName: string, url: string): string {
  // vivari 给的地址相对宿主源（`/preview/<port>/?__vv_kernel=…`）
  const target = new URL(url, location.origin);
  if (target.origin !== location.origin || !PREVIEW_PATH.test(target.pathname))
    throw new Error(`vivari 给出了意外的预览地址：${url}`);
  const frame = new URL('/preview-frame.html', location.origin);
  frame.searchParams.set('host', hostName);
  frame.searchParams.set('src', `${target.pathname}${target.search}`);
  return frame.href;
}

const entryKind = (entry: { isFile(): boolean; isDirectory(): boolean }): RuntimeHostEntry['kind'] => {
  if (entry.isDirectory()) return 'directory';
  return entry.isFile() ? 'file' : 'other';
};

/** 只用读取器：vivari 的 OutputStream 自带的异步迭代器类型与 DOM 库的 ReadableStream 不兼容。 */
type OutputSource = Pick<ReadableStream<string>, 'getReader'>;

async function drain(output: OutputSource, onData: (data: string) => void): Promise<void> {
  const reader = output.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) onData(chunk.value);
}

async function readLines(output: OutputSource, onLine: (line: string) => void): Promise<void> {
  let pending = '';
  await drain(output, data => {
    const lines = (pending + data).split('\n');
    pending = lines.pop() ?? '';
    lines.forEach(line => onLine(line.replace(/\r$/, '')));
  });
  if (pending) onLine(pending);
}

/** 故障信息里保留监听进程最后几行错误输出。 */
const WATCH_DIAGNOSTIC_LINES = 20;

/** vivari 进程只读合并输出；不读的 stdout / stderr 视图取消掉，否则每块输出都在那两个队列里积着。 */
function readMergedOutputOnly(child: {
  readonly stdout: Pick<ReadableStream<string>, 'cancel'>;
  readonly stderr: Pick<ReadableStream<string>, 'cancel'>;
}): void {
  void child.stdout.cancel();
  void child.stderr.cancel();
}

/** 输出转发完再报告退出码：工作台收到退出就关闭输出流。 */
async function forward(
  child: { readonly output: OutputSource; readonly exit: Promise<number> },
  events: RuntimeHostProcessEvents
): Promise<void> {
  const drained = drain(child.output, events.output).catch((cause: unknown) => {
    console.error('vivari 进程输出读取失败', cause);
  });
  const [code] = await Promise.all([child.exit, drained]);
  events.exit(code);
}

/** vivari 后端的依赖。 */
export interface VivariBackendOptions {
  /** 启动 vivari；宿主页里是 `Vivari.boot(...)`。 */
  readonly boot: () => Promise<VivariInstance>;
  readonly location: Pick<Location, 'origin'>;
  /** 内核宿主页的窗口名，预览容器页靠它找到内核。 */
  readonly hostName: string;
  /** 启动完成后交出实例。 */
  readonly onBoot?: (vivari: VivariInstance) => void;
}

/** 用 vivari 实现宿主后端：项目挂在 /project，进程都在项目根运行。 */
export function createVivariBackend(options: VivariBackendOptions): RuntimeHostBackend {
  const readyListeners = new Set<(port: number, url: string) => void>();
  let vivari: VivariInstance | undefined;
  let booting: Promise<void> | undefined;
  let torndown = false;

  const instance = (): VivariInstance => {
    if (torndown) throw new Error('vivari 宿主已拆除');
    if (!vivari) throw new Error('vivari 尚未启动');
    return vivari;
  };

  async function start(): Promise<void> {
    const booted = await options.boot();
    if (torndown) {
      booted.teardown();
      throw new Error('vivari 宿主已拆除');
    }
    vivari = booted;
    booted.on('server-ready', (port, url) => {
      const frame = previewFrameUrl(options.location, options.hostName, url);
      readyListeners.forEach(listener => listener(port, frame));
    });
    options.onBoot?.(booted);
  }

  return {
    boot: () => (booting ??= start()),
    async mount(tree) {
      const vm = instance();
      // VFS 会持久化在宿主源的 OPFS 里：先清掉上一个项目留下的文件，再挂载当前快照
      await vm.fs.rm(PROJECT_ROOT, { recursive: true, force: true });
      await vm.mount(tree, { mountPoint: PROJECT_ROOT });
    },
    async readdir(path) {
      const entries = await instance().fs.readdir(projectPath(path), { withFileTypes: true });
      return entries.map(entry => ({ name: entry.name, kind: entryKind(entry) }));
    },
    async readFile(path) {
      // vivari 的字节可能落在 SharedArrayBuffer 上，跨源传给工作台前复制一份
      return (await instance().fs.readFile(projectPath(path))).slice();
    },
    async writeFile(path, value) {
      await instance().fs.writeFile(projectPath(path), value);
    },
    async mkdir(path) {
      await instance().fs.mkdir(projectPath(path), { recursive: true });
    },
    async rm(path, recursive) {
      await instance().fs.rm(projectPath(path), { recursive, force: true });
    },
    watch(path, listener, onError) {
      // vivari 1.2.1 的 SDK 监听只报告经 SDK 的写入；进程自己写的文件（Shell 里新建、安装时改锁文件）
      // 只有 VM 内 Node 的 fs.watch 看得到，所以在 VM 里常驻一个监听进程，见 project-watcher
      const directory = projectPath(path);
      const prefix = directory === PROJECT_ROOT ? '' : `${path}/`;
      const diagnostics: string[] = [];
      let closed = false;
      let kill: (() => void) | undefined;
      const onLine = (line: string): void => {
        if (!line.startsWith(WATCH_EVENT)) {
          diagnostics.push(line);
          diagnostics.splice(0, diagnostics.length - WATCH_DIAGNOSTIC_LINES);
          return;
        }
        const [kind, file] = JSON.parse(line.slice(WATCH_EVENT.length)) as [unknown, unknown];
        if ((kind === 'change' || kind === 'rename') && typeof file === 'string') listener(kind, `${prefix}${file}`);
      };
      const supervise = async (): Promise<void> => {
        const child = await instance().spawn('node', ['-e', watchScript(directory, SYNC_IGNORED_DIRECTORIES)], {
          cwd: PROJECT_ROOT
        });
        kill = () => child.kill();
        if (closed) return child.kill();
        readMergedOutputOnly(child);
        const [code] = await Promise.all([child.exit, readLines(child.output, onLine)]);
        if (!closed) throw new Error(`vivari 文件监听进程退出（${code}）：${diagnostics.join('\n')}`);
      };
      void supervise().catch(onError);
      return () => {
        closed = true;
        kill?.();
      };
    },
    // vivari 没有伪终端，进程看到的尺寸固定为 80×24：忽略传入的尺寸，也不提供 resize
    async spawn(command, args, { env }, events) {
      const child = await instance().spawn(command, [...args], {
        cwd: PROJECT_ROOT,
        ...(env ? { env: { ...env } } : {})
      });
      const input = child.input.getWriter();
      readMergedOutputOnly(child);
      void forward(child, events);
      return { write: data => input.write(data), kill: () => child.kill() };
    },
    onServerReady(listener) {
      readyListeners.add(listener);
      return () => {
        readyListeners.delete(listener);
      };
    },
    teardown() {
      if (torndown) return;
      torndown = true;
      readyListeners.clear();
      vivari?.teardown();
      vivari = undefined;
    }
  };
}

/** 内核宿主页的配置。 */
export interface VivariHostOptions {
  /** 允许连接的工作台来源，来自部署配置。 */
  readonly parents: readonly string[];
  readonly boot: () => Promise<VivariInstance>;
}

/** 内核宿主页：握手后把 vivari 交给工作台驱动，并把预览容器页要用的接口挂在自己的窗口上。 */
export function startVivariHost(view: Window, options: VivariHostOptions): void {
  const host = view as VivariHostWindow;
  acceptHostConnection(view, options.parents, port => {
    const backend = createVivariBackend({
      boot: options.boot,
      location: view.location,
      hostName: view.name,
      onBoot(vivari) {
        host.aiaoVivariHost = { attachPreview: frame => vivari.attachPreview(frame) };
      }
    });
    serveRuntimeHost(port, backend);
  });
}

/** 按名字在工作台里找同源的内核宿主页；名字不是内核宿主页的格式时不取父窗口上的属性。 */
function kernelHost(view: Window, name: string): { window: Window; preview: VivariPreviewHost } | undefined {
  if (!name.startsWith(KERNEL_HOST_NAME)) return undefined;
  const target = (view.parent as unknown as Partial<Record<string, VivariHostWindow>>)[name];
  const preview = target?.aiaoVivariHost;
  return target && preview ? { window: target, preview } : undefined;
}

function showNotice(document: Document, message: string): void {
  const notice = document.createElement('p');
  notice.textContent = message;
  notice.style.cssText = 'margin:0;padding:16px;font:13px system-ui,sans-serif;color:#cccccc';
  document.body.replaceChildren(notice);
}

/**
 * 预览容器页：内层 iframe 才是 vivari 的服务预览。预览页把 WebSocket / SSE 帧发给父窗口（本页），
 * 本页转交同源的内核宿主页；内核发回的帧由 vivari 直接投递给内层 iframe。
 */
export function startPreviewFrame(view: Window): void {
  const params = new URLSearchParams(view.location.search);
  const src = params.get('src') ?? '';
  const { document } = view;
  if (!PREVIEW_PATH.test(src)) return showNotice(document, '预览地址无效');
  const host = kernelHost(view, params.get('host') ?? '');
  if (!host) return showNotice(document, '运行时已停止，请重新运行项目后再打开预览');
  const frame = document.createElement('iframe');
  frame.title = '项目服务预览';
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
  frame.src = src;
  document.body.replaceChildren(frame);
  const detach = host.preview.attachPreview(frame);
  view.addEventListener('message', event => {
    if (event.source === frame.contentWindow) host.window.postMessage(event.data, view.location.origin);
  });
  view.addEventListener('pagehide', detach);
}
