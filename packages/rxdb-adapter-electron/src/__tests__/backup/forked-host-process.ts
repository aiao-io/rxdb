/**
 * 强杀用例（US-217 AC#11）共用的 host 子进程管道：按源码打包 host 入口，fork 成子进程，经 Node 的 IPC 通道收发消息。
 *
 * @remarks
 * 生产上 host 跑在 Electron 主进程里。进程内的 host 杀不掉，能被 SIGKILL、且杀掉后由操作系统回收文件锁的只能是
 * 一个独立进程。各后端的入口（`electron-sqlite-host-process.ts`、`electron-pglite-host-process.ts`）把真实 host
 * 原样搬进子进程，这里只管那根管子：请求编号、应答配对、事件转发与强杀。消息按 V8 原生的结构化克隆编码
 *（`host-process-wire.ts`），与 Electron 的 `ipcRenderer.invoke` 一样，`Uint8Array` 与 `bigint` 原样过去，
 * 类型化数组连同背后的整个 `ArrayBuffer` 一起复制。
 */
import { buildSync } from 'esbuild';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, sep } from 'node:path';
import { decodeWire, encodeWire } from './host-process-wire.js';

/** 父进程发给子进程的一条请求：`id` 之外的字段由入口自己解释。 */
export type HostProcessRequest<Body extends object> = Body & { readonly id: number };

/** 子进程发回父进程的消息：请求的应答、host 推送的事件，或事件送达失败。 */
export type HostProcessMessage<Response, Event> =
  { readonly id: number; readonly response: Response } | { readonly event: Event } | { readonly deliveryError: string };

/** 跑在子进程里的一个 host，见 {@link forkHostProcess}。 */
export interface ForkedHostProcess<Body extends object> {
  /**
   * 发一条请求并等它的应答。
   *
   * @param body - 请求内容，编号由管道补上
   * @returns 入口发回的应答
   */
  request(body: Body): Promise<unknown>;
  /**
   * 订阅 host 推送的事件。
   *
   * @param listener - 事件回调
   * @returns 退订函数
   */
  subscribe(listener: (event: unknown) => void): () => void;
  /** 子进程写到 stdout / stderr 的全部内容；正常情况下应为空。 */
  output(): string;
  /** host 吞掉的事件送达失败；测试里它一定是缺陷。 */
  readonly deliveryErrors: readonly unknown[];
  /**
   * 以 SIGKILL 强杀子进程并等它退出：host 来不及回滚事务、关连接或删临时文件，与用户进程被系统杀掉一样。
   *
   * @remarks
   * 返回时在途请求都已失败，此后的请求也立刻失败，调用方再也碰不到库文件。已经退出时直接返回。
   */
  kill(): Promise<void>;
}

/** 打包产物所在的临时目录，以及每个入口源文件对应的产物。 */
let bundles: { readonly directory: string; readonly entries: Map<string, string> } | undefined;

/**
 * 入口的打包产物，第一次用到时按源码打成一个 CommonJS 文件。
 *
 * @remarks
 * 子进程不经 vitest 转译：Node 自带的类型剥离不认 `.js` → `.ts` 的导入改写、工作区包的 `@aiao/source` 条件与装饰器，
 * 只能先按与 vitest 相同的解析规则（源码条件 + tsconfig paths）打包。`worker_threads` 替代不了子进程：
 * SQLite 的 POSIX 文件锁按进程记账，同一进程里的线程之间互相看不见。
 *
 * @param source - 入口源文件的绝对路径
 * @param external - 不打进包、运行时再从 node_modules 加载的包
 * @returns 可直接 fork 的入口文件
 */
const bundleHostProcess = (source: string, external: readonly string[]): string => {
  bundles ??= { directory: mkdtempSync(join(tmpdir(), 'rxdb-electron-host-process-')), entries: new Map() };
  const cached = bundles.entries.get(source);
  if (cached !== undefined) return cached;
  const entry = join(bundles.directory, basename(source).replace(/\.ts$/, '.cjs'));
  buildSync({
    entryPoints: [source],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    conditions: ['@aiao/source'],
    tsconfig: join(import.meta.dirname, '..', '..', '..', 'tsconfig.spec.json'),
    external: [...external],
    logLevel: 'warning'
  });
  bundles.entries.set(source, entry);
  return entry;
};

const requireFromTests = createRequire(import.meta.url);

/**
 * 让留在包外的依赖在子进程里按包名找得到。
 *
 * @remarks
 * 打包产物落在临时目录里，从那里往上走不到工作区的 node_modules，只能经 `NODE_PATH` 指给它：
 * 取测试进程解析到的那一份所在的 node_modules 目录，子进程与测试加载的是同一个版本。
 *
 * @param external - 留在包外的包
 * @returns `NODE_PATH` 的值
 */
const nodePathFor = (external: readonly string[]): string => {
  const marker = `${sep}node_modules${sep}`;
  return external
    .map(name => {
      const resolved = requireFromTests.resolve(name);
      return resolved.slice(0, resolved.lastIndexOf(marker) + marker.length - 1);
    })
    .join(delimiter);
};

interface PendingRequest {
  readonly resolve: (response: unknown) => void;
  readonly reject: (error: Error) => void;
}

/**
 * 把入口打包后 fork 成子进程，经 Node 的 IPC 通道收发消息。
 *
 * @remarks
 * 依赖按模块自身位置找资源文件的包（PGlite 找它的 wasm 与数据文件）不能打进包里，经 `external` 留在包外。
 *
 * @param source - 入口源文件的绝对路径
 * @param args - 传给入口的命令行参数
 * @param external - 不打进包、运行时再从 node_modules 加载的包
 * @returns 子进程 host 的请求口与强杀入口
 */
export const forkHostProcess = <Body extends object>(
  source: string,
  args: readonly string[],
  external: readonly string[] = []
): ForkedHostProcess<Body> => {
  const child = fork(bundleHostProcess(source, external), [...args], {
    serialization: 'advanced',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    // 子进程跑的是打好的产物，不该继承 vitest 给测试进程加的加载器与调试参数。
    execArgv: [],
    env: external.length === 0 ? process.env : { ...process.env, NODE_PATH: nodePathFor(external) }
  });
  const pending = new Map<number, PendingRequest>();
  const listeners = new Set<(event: unknown) => void>();
  const deliveryErrors: unknown[] = [];
  let nextId = 1;
  let output = '';
  let exit: Error | undefined;

  const failAll = (error: Error): void => {
    exit ??= error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const dispatch = (message: HostProcessMessage<unknown, unknown>): void => {
    if ('event' in message) {
      for (const listener of listeners) listener(message.event);
      return;
    }
    if ('deliveryError' in message) {
      deliveryErrors.push(message.deliveryError);
      return;
    }
    const request = pending.get(message.id);
    // 没有对应 promise 的应答说明协议对不上。抛在 IPC 回调里只会变成测试进程的 uncaught exception，
    // 改成让在途请求带着真实原因失败。
    if (!request) {
      failAll(new Error(`the host process answered an unknown request: ${String(message.id)}`));
      child.kill('SIGKILL');
      return;
    }
    pending.delete(message.id);
    request.resolve(message.response);
  };

  const { stdout, stderr } = child;
  if (!stdout || !stderr) throw new Error('the host process was forked without piped stdout / stderr');
  for (const stream of [stdout, stderr]) {
    stream.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
  }
  child.on('message', message => dispatch(decodeWire(message as Uint8Array) as HostProcessMessage<unknown, unknown>));
  child.on('exit', (code, signal) =>
    failAll(new Error(`the host process exited (${String(code ?? signal)}): ${output}`))
  );
  child.on('error', error => failAll(error));
  // 'close' 在 'exit' 之后、stdout / stderr 都读完时才来：等到它，`output()` 才是完整的。
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));

  return {
    request: body =>
      new Promise((resolve, reject) => {
        if (exit) {
          reject(exit);
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve, reject });
        // 通道已断而 'exit' 还没到的那个窗口里，发送失败会从回调回来。
        child.send(encodeWire({ ...body, id } satisfies HostProcessRequest<Body>), error => {
          if (error) failAll(error);
        });
      }),
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    output: () => output,
    deliveryErrors,
    kill: () => {
      // 进程已经退出时 `kill()` 什么也不做；'exit' 上的 failAll 总先于 'close' 跑完。
      child.kill('SIGKILL');
      return closed;
    }
  };
};

/** 删掉所有入口的打包产物；由用到子进程 host 的套件在收尾时调用，调用前先杀掉它们。 */
export const removeHostProcessBundles = (): void => {
  if (bundles) rmSync(bundles.directory, { recursive: true, force: true });
  bundles = undefined;
};
