/**
 * 把 stdio 测试宿主进程包装成 Tauri 的 `invoke` / `listen` 形状。
 *
 * @remarks
 * 一致性测试要证明的是「**Rust 引擎**与 Electron / wasm 后端行为一致」，所以被测对象
 * 必须是真的 Rust 进程，不能是 in-process 的替身。但 `tauri::App` 需要一个窗口和事件循环，
 * 在 Vitest 里跑不起来——于是走 `src-tauri/src/bin/rxdb_host_stdio.rs`：同一份
 * `rxdb::session::Host`，只是把 `invoke` 换成了 stdin、把 `emit` 换成了 stdout。
 *
 * 换掉的只有最外层那根管子，且**连传输层都不换**：本模块产出的 `invoke` / `listen`
 * 直接喂给包里的 `createTauriHostTransport`，因此标签编解码、事件扇出、退订这些
 * 生产代码同样在套件覆盖之下。
 *
 * @module conformance/rust-host-transport
 */

import { createTauriHostTransport, type DesktopHostTransport } from '@aiao/rxdb-adapter-desktop';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:process';

/**
 * 测试宿主二进制的位置，由 Nx 的 `build-test-host` target 产出。
 *
 * @remarks
 * Windows 上 cargo 产出的是 `.exe`。少了后缀，套件在那儿只会报「二进制不存在，去跑
 * build-test-host」——而那条命令刚刚才成功跑完，提示指向的是一个不存在的问题。
 */
const HOST_BINARY = resolve(
  import.meta.dirname,
  '..',
  'src-tauri',
  'target',
  'debug',
  `rxdb_host_stdio${platform === 'win32' ? '.exe' : ''}`
);

interface PendingRequest {
  readonly resolve: (payload: unknown) => void;
  readonly reject: (error: Error) => void;
}

/** 一个已启动的 stdio 宿主进程。 */
export interface RustHostProcess {
  /** Tauri `invoke` 的替身，把请求写进子进程的 stdin。 */
  readonly invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Tauri `listen` 的替身，把子进程推来的变更事件转成 `{ payload }`。 */
  readonly listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
  /** 子进程写到 stderr 的全部内容；正常情况下应为空。 */
  readonly stderr: () => string;
  /** 关掉子进程并让所有在途请求失败。 */
  readonly stop: () => void;
}

const requireBinary = (): string => {
  if (existsSync(HOST_BINARY)) return HOST_BINARY;
  throw new Error(
    `the conformance host binary is missing at ${HOST_BINARY}; ` +
      `run \`pnpm nx run dev-rxdb-tauri:build-test-host\` (the test-conformance target does this for you)`
  );
};

/**
 * 启动 stdio 宿主进程。
 *
 * @param root - 数据库根目录，宿主会在其下建 `rxdb-data/`
 * @returns 进程句柄与两个 Tauri API 替身
 */
export function startRustHostProcess(root: string): RustHostProcess {
  const child: ChildProcessWithoutNullStreams = spawn(requireBinary(), [root], { stdio: 'pipe' });
  const pending = new Map<number, PendingRequest>();
  const eventHandlers = new Set<(event: { payload: unknown }) => void>();
  let nextId = 1;
  let buffer = '';
  let stderr = '';
  let exit: Error | undefined;

  const failAll = (error: Error): void => {
    exit ??= error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const dispatch = (line: string): void => {
    const message = JSON.parse(line) as { id?: number; payload?: unknown; event?: unknown };
    if (message.event !== undefined) {
      for (const handler of eventHandlers) handler({ payload: message.event });
      return;
    }
    const request = typeof message.id === 'number' ? pending.get(message.id) : undefined;
    // 没有对应 promise 的应答说明协议对不上，静默丢弃只会让故障以超时的形式出现在别处。
    if (!request) throw new Error(`the conformance host answered an unknown request: ${line}`);
    pending.delete(message.id as number);
    request.resolve(message.payload);
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    try {
      for (const line of lines) if (line.trim()) dispatch(line);
    } catch (error) {
      // 这里是 stream 的 'data' 回调，异常逃出去就是 uncaught exception：Vitest worker 整个崩掉，
      // 报出来的是一句与协议无关的进程死亡。改成让在途请求带着真实原因失败，
      // 等着它的那条测试就能读到「宿主答了个不认识的 id」这类可诊断的话。
      failAll(error instanceof Error ? error : new Error(String(error)));
      child.kill();
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.on('exit', code => failAll(new Error(`the conformance host exited with code ${String(code)}: ${stderr}`)));
  child.on('error', error => failAll(error));

  return {
    // 刻意**不**在这里排队：Tauri 的 `invoke` 是真并发，测试替身一旦替被测代码把请求
    // 串起来，`DesktopSqliteClient` 里的顺序保证就再也验不到了——而那正是这条路径上
    // 最容易回归的性质。
    invoke: (command, args) =>
      new Promise((resolveRequest, rejectRequest) => {
        if (exit) {
          rejectRequest(exit);
          return;
        }
        const id = nextId++;
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest });
        child.stdin.write(`${JSON.stringify({ id, command, payload: args.payload })}\n`);
      }),

    listen: (_event, handler) => {
      eventHandlers.add(handler);
      return Promise.resolve(() => {
        eventHandlers.delete(handler);
      });
    },

    stderr: () => stderr,

    stop: () => {
      child.stdin.end();
      child.kill();
    }
  };
}

/**
 * 用 stdio 宿主进程组装一条与生产同款的桌面传输层。
 *
 * @param root - 数据库根目录
 * @returns 进程句柄、传输层，以及变更通道的健康信号
 */
export function createRustHostTransport(root: string): {
  process: RustHostProcess;
  transport: DesktopHostTransport;
  /** 变更事件通道上出过的错；正常情况下应为空。 */
  deliveryErrors: () => readonly unknown[];
} {
  const host = startRustHostProcess(root);
  const deliveryErrors: unknown[] = [];
  return {
    process: host,
    deliveryErrors: () => deliveryErrors,
    transport: createTauriHostTransport({
      invoke: host.invoke,
      listen: host.listen,
      // 记下来而不是抛出去：这个回调是从 Tauri（这里是 stdin 数据回调）里同步调的，
      // 抛出去只会变成一句与故障无关的 worker 崩溃。攒成数组由 afterAll 断言，
      // 与 Electron 工厂的 `desktopHostDeliveryErrors()` 是同一个旁路信号。
      onListenError: error => deliveryErrors.push(error)
    })
  };
}

/**
 * 逻辑库名 → 物理文件路径，与 `src-tauri/src/rxdb/paths.rs` 的 `DATABASE_DIRECTORY` 保持一致。
 *
 * @param root - 数据库根目录
 * @param databaseName - 应用作用域内的逻辑库名
 * @returns 物理文件路径
 */
export function rustDatabasePath(root: string, databaseName: string): string {
  return join(root, 'rxdb-data', databaseName);
}
