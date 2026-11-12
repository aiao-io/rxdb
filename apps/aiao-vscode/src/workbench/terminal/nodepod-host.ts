import type { MemoryVolume, Nodepod } from '@r1ck404/nodepod';
import { PROJECT_ROOT, acceptHostConnection, projectPath } from './runtime-host-page.js';
import {
  serveRuntimeHost,
  type RuntimeHostBackend,
  type RuntimeHostEntry,
  type RuntimeHostProcess,
  type RuntimeHostProcessEvents
} from './runtime-host-protocol.js';
import type { TerminalFileTree, TerminalSize } from './terminal-runtime.js';

/** 宿主用到的 Nodepod 文件系统卷接口（主线程里的同步卷，进程 Worker 的写入也会同步回来）。 */
type NodepodVolume = Pick<
  MemoryVolume,
  | 'kindSync'
  | 'readdirSync'
  | 'childKindsSync'
  | 'readFileSync'
  | 'writeFileSync'
  | 'mkdirSync'
  | 'removeTreeSync'
  | 'unlinkSync'
  | 'rmdirSync'
  | 'watch'
>;

/** 宿主用到的 Nodepod 实例能力。 */
export type NodepodInstance = Pick<Nodepod, 'spawn' | 'createTerminal' | 'teardown'> & {
  readonly volume: NodepodVolume;
};

/** Nodepod 后端的依赖。 */
export interface NodepodBackendOptions {
  /** 启动 Nodepod；服务就绪回调只能在启动时传进去。 */
  readonly boot: (onServerReady: (port: number, url: string) => void) => Promise<NodepodInstance>;
  readonly location: Pick<Location, 'origin'>;
  /** 给 NodepodTerminal 一个不显示的挂载点。 */
  readonly document: Pick<Document, 'createElement'>;
}

const entryKind = (kind: 'file' | 'directory' | 'symlink' | null | undefined): RuntimeHostEntry['kind'] =>
  kind === 'file' || kind === 'directory' ? kind : 'other';

function writeTree(volume: NodepodVolume, directory: string, tree: TerminalFileTree): void {
  for (const [name, node] of Object.entries(tree)) {
    const path = `${directory}/${name}`;
    if ('file' in node) {
      volume.writeFileSync(path, node.file.contents);
      continue;
    }
    volume.mkdirSync(path, { recursive: true });
    writeTree(volume, path, node.directory);
  }
}

/**
 * 交互 Shell：NodepodTerminal 自己做提示符、行编辑、历史与 Ctrl+C，只差一个 xterm。
 * 给它一个只转发的 xterm：写出交给工作台的终端显示，输入与尺寸来自工作台。
 */
function openShell(
  nodepod: NodepodInstance,
  document: Pick<Document, 'createElement'>,
  size: TerminalSize,
  events: RuntimeHostProcessEvents
): RuntimeHostProcess {
  const inputs = new Set<(data: string) => void>();
  const resizes = new Set<() => void>();
  let current = size;
  let closed = false;
  const output = (text: string): void => {
    if (!closed) events.output(text);
  };
  const subscribe = <T>(listeners: Set<T>, listener: T): { dispose(): void } => {
    listeners.add(listener);
    return {
      dispose() {
        listeners.delete(listener);
      }
    };
  };
  /** NodepodTerminal 用到的 xterm 成员。 */
  class HostTerminal {
    readonly options: Record<string, unknown> = {};
    get cols(): number {
      return current.cols;
    }
    get rows(): number {
      return current.rows;
    }
    open(): void {
      // 不在宿主页里渲染，输出交给工作台的终端
    }
    focus(): void {
      // 焦点在工作台的终端
    }
    loadAddon(): void {
      // 不加载 xterm 插件
    }
    dispose(): void {
      // 结束由 kill 处理
    }
    clear(): void {
      output('\u001b[2J\u001b[3J\u001b[H');
    }
    write(text: string): void {
      output(text);
    }
    writeln(text: string): void {
      output(`${text}\r\n`);
    }
    onData(listener: (data: string) => void): { dispose(): void } {
      return subscribe(inputs, listener);
    }
    onResize(listener: () => void): { dispose(): void } {
      return subscribe(resizes, listener);
    }
  }
  const terminal = nodepod.createTerminal({ Terminal: HostTerminal });
  terminal.attach(document.createElement('div'));
  return {
    async write(data) {
      inputs.forEach(listener => listener(data));
    },
    resize(next) {
      current = next;
      resizes.forEach(listener => listener());
    },
    kill() {
      if (closed) return;
      closed = true;
      terminal.detach();
      events.exit(0);
    }
  };
}

/** 用 Nodepod 实现宿主后端：项目挂在 /project，文件操作直接走主线程的同步卷。 */
export function createNodepodBackend(options: NodepodBackendOptions): RuntimeHostBackend {
  const readyListeners = new Set<(port: number, url: string) => void>();
  let nodepod: NodepodInstance | undefined;
  let booting: Promise<void> | undefined;
  let torndown = false;

  const instance = (): NodepodInstance => {
    if (torndown) throw new Error('Nodepod 宿主已拆除');
    if (!nodepod) throw new Error('Nodepod 尚未启动');
    return nodepod;
  };

  async function start(): Promise<void> {
    const booted = await options.boot((port, url) => {
      // 路径形式的预览地址（`/__virtual__/…`）相对宿主源
      const address = new URL(url, options.location.origin).href;
      readyListeners.forEach(listener => listener(port, address));
    });
    if (torndown) {
      void booted.teardown();
      throw new Error('Nodepod 宿主已拆除');
    }
    nodepod = booted;
  }

  return {
    boot: () => (booting ??= start()),
    async mount(tree) {
      const { volume } = instance();
      if (volume.kindSync(PROJECT_ROOT)) volume.removeTreeSync(PROJECT_ROOT);
      volume.mkdirSync(PROJECT_ROOT, { recursive: true });
      writeTree(volume, PROJECT_ROOT, tree);
    },
    async readdir(path) {
      const { volume } = instance();
      const directory = projectPath(path);
      const names = volume.readdirSync(directory);
      const kinds = volume.childKindsSync(directory, names);
      return names.map((name, index) => ({ name, kind: entryKind(kinds[index]) }));
    },
    async readFile(path) {
      // 卷里存的是它自己的缓冲，交给协议前复制一份
      return instance().volume.readFileSync(projectPath(path)).slice();
    },
    async writeFile(path, value) {
      instance().volume.writeFileSync(projectPath(path), value);
    },
    async mkdir(path) {
      instance().volume.mkdirSync(projectPath(path), { recursive: true });
    },
    async rm(path, recursive) {
      const { volume } = instance();
      const target = projectPath(path);
      const kind = volume.kindSync(target);
      if (!kind) return;
      if (kind === 'file') volume.unlinkSync(target);
      else if (recursive) volume.removeTreeSync(target);
      else volume.rmdirSync(target);
    },
    watch(path, listener, onError) {
      const directory = projectPath(path);
      const prefix = directory === PROJECT_ROOT ? '' : `${path}/`;
      const handle = instance().volume.watch(directory, { recursive: true }, (kind, name) => {
        if (name) listener(kind, `${prefix}${name}`);
      });
      handle.on('error', onError);
      return () => handle.close();
    },
    async spawn(command, args, { env, size }, events) {
      const pod = instance();
      // Unix 惯例：无参的 sh 是交互 Shell
      if (command === 'sh' && args.length === 0) return openShell(pod, options.document, size, events);
      const child = await pod.spawn(command, [...args], { cwd: PROJECT_ROOT, ...(env ? { env: { ...env } } : {}) });
      // output 是 stdout，error 是 stderr；completion 在剩余输出推完之后才兑现
      child.on('output', events.output);
      child.on('error', events.output);
      void child.completion.then(({ exitCode }) => events.exit(exitCode));
      return {
        async write(data) {
          child.write(data);
        },
        kill: () => child.kill()
      };
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
      void nodepod?.teardown().catch((cause: unknown) => {
        console.error('Nodepod 拆除失败', cause);
      });
      nodepod = undefined;
    }
  };
}

/** Nodepod 宿主页的配置。 */
export interface NodepodHostOptions {
  /** 允许连接的工作台来源，来自部署配置。 */
  readonly parents: readonly string[];
  readonly boot: NodepodBackendOptions['boot'];
}

/** Nodepod 宿主页：握手后把 Nodepod 交给工作台驱动。服务预览直接嵌宿主源上的预览地址，不需要容器页。 */
export function startNodepodHost(view: Window, options: NodepodHostOptions): void {
  acceptHostConnection(view, options.parents, port => {
    serveRuntimeHost(
      port,
      createNodepodBackend({ boot: options.boot, location: view.location, document: view.document })
    );
  });
}
