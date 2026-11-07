import type { TerminalContainer, TerminalFileTree, TerminalProcess, TerminalSize } from './terminal-runtime.js';

/** 宿主页加载完成后通知父窗口；不带数据，目标源可以是 `*`。 */
export const RUNTIME_HOST_READY = 'aiao-runtime-host:ready';
/** 工作台回复的握手消息，附带私有端口，只发往配置的宿主源。 */
export const RUNTIME_HOST_CONNECT = 'aiao-runtime-host:connect';

/** 握手消息的形状检查；跨窗口消息来自任意页面，先判断再使用。 */
export const isHostMessage = (data: unknown, type: string): boolean =>
  typeof data === 'object' && data !== null && (data as { readonly type?: unknown }).type === type;

/** 宿主目录条目：消息只能传数据，类型判断方法在工作台侧还原。 */
export interface RuntimeHostEntry {
  readonly name: string;
  readonly kind: 'file' | 'directory' | 'other';
}

/** 宿主进程向工作台报告的输出与退出。 */
export interface RuntimeHostProcessEvents {
  output(data: string): void;
  exit(code: number): void;
}

/** 宿主里运行中的进程。 */
export interface RuntimeHostProcess {
  write(data: string): Promise<void>;
  kill(): void;
  /** 终端尺寸变化；运行时没有终端尺寸概念（如 vivari 固定 80×24）时不提供。 */
  resize?(size: TerminalSize): void;
}

/** 起进程时的环境与终端尺寸。 */
export interface RuntimeHostSpawnOptions {
  readonly env: Readonly<Record<string, string>> | undefined;
  readonly size: TerminalSize;
}

/** 独立源宿主页里的运行时实现；路径都相对项目根，`.` 是项目根。 */
export interface RuntimeHostBackend {
  boot(): Promise<void>;
  mount(tree: TerminalFileTree): Promise<void>;
  readdir(path: string): Promise<readonly RuntimeHostEntry[]>;
  /** 返回的字节要能跨源传递，不能落在 SharedArrayBuffer 上。 */
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, value: string | Uint8Array): Promise<void>;
  /** 逐级创建目录。 */
  mkdir(path: string): Promise<void>;
  /** 删除文件或目录，路径不存在不报错。 */
  rm(path: string, recursive: boolean): Promise<void>;
  /** 递归监听，回调里的路径相对项目根；注册之后的失败交给 onError；返回注销函数。 */
  watch(
    path: string,
    listener: (kind: 'change' | 'rename', path: string) => void,
    onError: (cause: unknown) => void
  ): () => void;
  spawn(
    command: string,
    args: readonly string[],
    options: RuntimeHostSpawnOptions,
    events: RuntimeHostProcessEvents
  ): Promise<RuntimeHostProcess>;
  /** 服务可访问时给出工作台可以直接嵌入的预览地址；返回注销函数。 */
  onServerReady(listener: (port: number, url: string) => void): () => void;
  teardown(): void;
}

/** 工作台侧的宿主连接：容器边界之外多一个启动步骤。 */
export interface RuntimeHostConnection extends TerminalContainer {
  boot(): Promise<void>;
}

type HostCall =
  | { readonly method: 'boot' }
  | { readonly method: 'mount'; readonly tree: TerminalFileTree }
  | { readonly method: 'readdir'; readonly path: string }
  | { readonly method: 'readFile'; readonly path: string }
  | { readonly method: 'writeFile'; readonly path: string; readonly value: string | Uint8Array }
  | { readonly method: 'mkdir'; readonly path: string }
  | { readonly method: 'rm'; readonly path: string; readonly recursive: boolean }
  | {
      readonly method: 'spawn';
      readonly command: string;
      readonly args: readonly string[];
      readonly options: RuntimeHostSpawnOptions;
    };

interface HostResults {
  boot: void;
  mount: void;
  readdir: readonly RuntimeHostEntry[];
  readFile: Uint8Array;
  writeFile: void;
  mkdir: void;
  rm: void;
  spawn: void;
}

type HostRequest =
  | (HostCall & { readonly type: 'call'; readonly id: number })
  | { readonly type: 'input'; readonly id: number; readonly data: string }
  | { readonly type: 'kill'; readonly id: number }
  | { readonly type: 'resize'; readonly id: number; readonly size: TerminalSize }
  | { readonly type: 'watch'; readonly id: number; readonly path: string }
  | { readonly type: 'unwatch'; readonly id: number }
  | { readonly type: 'teardown' };

type HostEvent =
  | { readonly type: 'result'; readonly id: number; readonly value: unknown }
  | { readonly type: 'error'; readonly id: number; readonly message: string }
  | { readonly type: 'output'; readonly id: number; readonly data: string }
  | { readonly type: 'exit'; readonly id: number; readonly code: number }
  | { readonly type: 'change'; readonly id: number; readonly kind: 'change' | 'rename'; readonly path: string }
  | { readonly type: 'server-ready'; readonly port: number; readonly url: string }
  /** 宿主出了调用之外的故障，连接不再可用。 */
  | { readonly type: 'fault'; readonly message: string };

const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** 宿主页一侧：把端口上的请求交给运行时后端，返回停止服务并拆除后端的函数。 */
export function serveRuntimeHost(port: MessagePort, backend: RuntimeHostBackend): () => void {
  const processes = new Map<number, RuntimeHostProcess>();
  const watchers = new Map<number, () => void>();
  let stopped = false;

  const send = (event: HostEvent): void => {
    if (!stopped) port.postMessage(event);
  };
  /** 结果无法跨源复制时如实报错，调用方不会一直等下去。 */
  const respond = (id: number, value: unknown): void => {
    try {
      send({ type: 'result', id, value });
    } catch (cause) {
      send({ type: 'error', id, message: messageOf(cause) });
    }
  };
  const offServerReady = backend.onServerReady((serverPort, url) =>
    send({ type: 'server-ready', port: serverPort, url })
  );

  async function spawn(id: number, request: Extract<HostCall, { method: 'spawn' }>): Promise<void> {
    let exited = false;
    const child = await backend.spawn(request.command, request.args, request.options, {
      output: data => send({ type: 'output', id, data }),
      exit: code => {
        exited = true;
        processes.delete(id);
        send({ type: 'exit', id, code });
      }
    });
    if (stopped) child.kill();
    else if (!exited) processes.set(id, child);
  }

  function invoke(request: HostCall & { readonly id: number }): Promise<unknown> {
    switch (request.method) {
      case 'boot':
        return backend.boot();
      case 'mount':
        return backend.mount(request.tree);
      case 'readdir':
        return backend.readdir(request.path);
      case 'readFile':
        return backend.readFile(request.path);
      case 'writeFile':
        return backend.writeFile(request.path, request.value);
      case 'mkdir':
        return backend.mkdir(request.path);
      case 'rm':
        return backend.rm(request.path, request.recursive);
      case 'spawn':
        return spawn(request.id, request);
    }
  }

  const fault = (cause: unknown): void => send({ type: 'fault', message: messageOf(cause) });

  function watch(id: number, path: string): void {
    try {
      watchers.set(
        id,
        backend.watch(path, (kind, changed) => send({ type: 'change', id, kind, path: changed }), fault)
      );
    } catch (cause) {
      fault(cause);
    }
  }

  function unwatch(id: number): void {
    watchers.get(id)?.();
    watchers.delete(id);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    port.onmessage = null;
    offServerReady();
    watchers.forEach(close => close());
    watchers.clear();
    processes.clear();
    backend.teardown();
    port.close();
  }

  port.onmessage = ({ data }: MessageEvent<HostRequest>) => {
    switch (data.type) {
      case 'call':
        void Promise.resolve()
          .then(() => invoke(data))
          .then(
            value => respond(data.id, value),
            cause => send({ type: 'error', id: data.id, message: messageOf(cause) })
          );
        return;
      case 'input':
        // 与真实终端一致：进程退出后的输入没有接收方，直接丢弃
        void processes
          .get(data.id)
          ?.write(data.data)
          .catch(() => undefined);
        return;
      case 'kill':
        processes.get(data.id)?.kill();
        return;
      case 'resize':
        processes.get(data.id)?.resize?.(data.size);
        return;
      case 'watch':
        watch(data.id, data.path);
        return;
      case 'unwatch':
        unwatch(data.id);
        return;
      case 'teardown':
        stop();
    }
  };
  return stop;
}

interface HostChild {
  output(data: string): void;
  finish(code: number): void;
}

/** 工作台一侧：经端口驱动独立源宿主里的运行时；拆除后调用 release 回收宿主页。 */
export function connectRuntimeHost(port: MessagePort, release: () => void): RuntimeHostConnection {
  const pending = new Map<number, { resolve(value: unknown): void; reject(cause: Error): void }>();
  const children = new Map<number, HostChild>();
  const watchers = new Map<number, (kind: 'change' | 'rename', path: string) => void>();
  const readyListeners = new Set<(port: number, url: string) => void>();
  let nextId = 1;
  let failure: Error | undefined;
  let released = false;

  const post = (request: HostRequest): void => {
    if (!failure) port.postMessage(request);
  };

  function request<C extends HostCall>(id: number, call: C): Promise<HostResults[C['method']]> {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      port.postMessage({ ...call, type: 'call', id });
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    });
  }
  const call = <C extends HostCall>(value: C): Promise<HostResults[C['method']]> => request(nextId++, value);

  function settle(id: number): { resolve(value: unknown): void; reject(cause: Error): void } | undefined {
    const entry = pending.get(id);
    pending.delete(id);
    return entry;
  }

  /** 连接失效：进行中的调用拒绝，进程以 -1 结束，之后的调用以同一原因拒绝。 */
  function shut(reason: Error): void {
    if (failure) return;
    failure = reason;
    pending.forEach(entry => entry.reject(reason));
    pending.clear();
    children.forEach(child => child.finish(-1));
    children.clear();
    watchers.clear();
    readyListeners.clear();
  }

  function openChild(id: number): TerminalProcess {
    let controller!: ReadableStreamDefaultController<string>;
    let settleExit!: (code: number) => void;
    let reading = true;
    const output = new ReadableStream<string>({
      start(value) {
        controller = value;
      },
      cancel() {
        reading = false;
      }
    });
    const exit = new Promise<number>(resolve => {
      settleExit = resolve;
    });
    children.set(id, {
      output(data) {
        if (reading) controller.enqueue(data);
      },
      finish(code) {
        children.delete(id);
        if (reading) controller.close();
        reading = false;
        settleExit(code);
      }
    });
    return {
      input: new WritableStream<string>({
        write(data) {
          post({ type: 'input', id, data });
        }
      }),
      output,
      exit,
      resize(size) {
        if (children.has(id)) post({ type: 'resize', id, size: { cols: size.cols, rows: size.rows } });
      },
      kill() {
        if (children.has(id)) post({ type: 'kill', id });
      }
    };
  }

  port.onmessage = ({ data }: MessageEvent<HostEvent>) => {
    switch (data.type) {
      case 'result':
        settle(data.id)?.resolve(data.value);
        return;
      case 'error':
        settle(data.id)?.reject(new Error(data.message));
        return;
      case 'output':
        children.get(data.id)?.output(data.data);
        return;
      case 'exit':
        children.get(data.id)?.finish(data.code);
        return;
      case 'change':
        watchers.get(data.id)?.(data.kind, data.path);
        return;
      case 'server-ready':
        readyListeners.forEach(listener => listener(data.port, data.url));
        return;
      case 'fault':
        shut(new Error(data.message));
    }
  };

  return {
    boot: () => call({ method: 'boot' }),
    fs: {
      async readdir(path) {
        const entries = await call({ method: 'readdir', path });
        return entries.map(({ name, kind }) => ({
          name,
          isFile: () => kind === 'file',
          isDirectory: () => kind === 'directory'
        }));
      },
      readFile: path => call({ method: 'readFile', path }),
      writeFile: (path, value) => call({ method: 'writeFile', path, value }),
      mkdir: path => call({ method: 'mkdir', path }),
      rm: (path, options) => call({ method: 'rm', path, recursive: options.recursive === true }),
      watch(path, _options, listener) {
        const id = nextId++;
        watchers.set(id, listener);
        post({ type: 'watch', id, path });
        return {
          close() {
            if (watchers.delete(id)) post({ type: 'unwatch', id });
          }
        };
      }
    },
    mount: tree => call({ method: 'mount', tree }),
    async spawn(command, args, options) {
      const id = nextId++;
      const child = openChild(id);
      try {
        await request(id, {
          method: 'spawn',
          command,
          args: [...args],
          options: { env: options.env, size: { cols: options.terminal.cols, rows: options.terminal.rows } }
        });
      } catch (cause) {
        children.delete(id);
        throw cause;
      }
      return child;
    },
    on(_event, listener) {
      readyListeners.add(listener);
      return () => {
        readyListeners.delete(listener);
      };
    },
    teardown() {
      if (released) return;
      released = true;
      shut(new Error('运行时宿主已释放'));
      port.postMessage({ type: 'teardown' } satisfies HostRequest);
      port.onmessage = null;
      release();
    }
  };
}
