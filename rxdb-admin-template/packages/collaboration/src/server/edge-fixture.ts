import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { edgeFunctionName } from './runtime.js';

/**
 * 在本机 Docker 里起一个 Supabase Edge Function：`supabase/edge-runtime` 容器加载本仓库的函数目录
 * （`supabase/functions/admin-collaboration`，含 esbuild 产物）与本机主服务（`scripts/edge-runtime/main`，限额同线上：
 * 每个请求 2 秒 CPU、256 MB 内存）。命令契约测试、三端 E2E 的 Edge 模式、资源测量与 `serve-edge` 共用它；生产环境不用。
 * 容器名形如 `admin-edge-<随机>`，加入数据库所在的 docker 网络，端口只发布到 127.0.0.1，`stop()` 时删除。
 */
export const edgeRuntimeImage = 'supabase/edge-runtime:v1.74.0';
const run = promisify(execFile);

/** 起函数的选项：交给函数的环境变量、要加入的网络、主服务的设置（`EDGE_*`，见主服务说明）与本机端口。 */
export interface EdgeFunctionOptions {
  env: Readonly<Record<string, string>>;
  /** 换一个函数目录（每个子目录一个函数），默认是本仓库的 `supabase/functions`；在 Edge Runtime 里跑测试用例时用。 */
  functions?: string;
  network?: string;
  runtime?: Readonly<Record<string, string>>;
  /** 发布到本机 127.0.0.1 的端口，不给则由 Docker 随机分配。 */
  port?: number;
  /** 是否启动事件 worker（逐 worker 打印 CPU 时间与内存，资源测量用）。 */
  events?: boolean;
}
/** 一个正在运行的函数容器。 */
export interface EdgeFunction {
  container: string;
  /** 主服务的地址，例如 `http://127.0.0.1:54329`。 */
  origin: string;
  /** 函数的地址：`<origin>/admin-collaboration`，与 Supabase 的 `/functions/v1/admin-collaboration` 对应。 */
  url: string;
  logs(): Promise<string>;
  stop(): Promise<void>;
}

const exists = async (target: string) =>
  access(target).then(
    () => true,
    () => false
  );
/** 从本模块所在目录向上找到协作包的根（源码与编译产物都在包里，层级不同）。 */
async function packageRoot(from: string = path.dirname(fileURLToPath(import.meta.url))): Promise<string> {
  for (let current = from; ; current = path.dirname(current)) {
    if (await exists(path.join(current, 'scripts', 'edge-runtime', 'main', 'index.ts'))) return current;
    if (path.dirname(current) === current) throw new Error(`Cannot find the collaboration package above ${from}`);
  }
}
/** 函数目录、主服务与事件 worker 的位置。 */
export async function edgePaths() {
  const root = await packageRoot();
  const functions = path.join(root, '..', '..', 'supabase', 'functions');
  return {
    functions,
    bundle: path.join(functions, edgeFunctionName, 'dist', 'collaboration.js'),
    main: path.join(root, 'scripts', 'edge-runtime', 'main'),
    events: path.join(root, 'scripts', 'edge-runtime', 'events')
  };
}

async function healthy(origin: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const ok = await fetch(`${origin}/_internal/health`).then(
      response => response.ok,
      () => false
    );
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`Edge runtime at ${origin} never became healthy`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/** 起函数容器并等到主服务可用；函数本身在第一个请求时冷启动。产物不存在时抛错，提示先构建。 */
export async function startEdgeFunction(options: EdgeFunctionOptions): Promise<EdgeFunction> {
  const paths = await edgePaths();
  if (!options.functions && !(await stat(paths.bundle).catch(() => undefined))?.isFile())
    throw new Error(`Missing ${paths.bundle}; run \`pnpm nx run admin-collaboration:build-edge\` first`);
  const functions = options.functions ?? paths.functions;
  const container = `admin-edge-${randomUUID().slice(0, 8)}`;
  const args = ['run', '-d', '--rm', '--name', container, '--add-host', 'host.docker.internal:host-gateway'];
  args.push('-p', `127.0.0.1:${options.port ?? ''}:9000`, '-v', `${functions}:/home/deno/functions:ro`);
  args.push('-v', `${paths.main}:/home/deno/main:ro`);
  if (options.events) args.push('-v', `${paths.events}:/home/deno/events:ro`);
  if (options.network) args.push('--network', options.network);
  for (const [name, value] of Object.entries({ ...options.env, ...options.runtime }))
    args.push('-e', `${name}=${value}`);
  args.push(edgeRuntimeImage, 'start', '--main-service', '/home/deno/main');
  if (options.events) args.push('--event-worker', '/home/deno/events');
  await run('docker', args);
  const stop = async () => {
    await run('docker', ['rm', '-f', container]).catch(() => undefined);
  };
  try {
    const { stdout } = await run('docker', ['port', container, '9000/tcp']);
    const origin = `http://127.0.0.1:${Number(stdout.trim().split('\n')[0].split(':').at(-1))}`;
    await healthy(origin);
    const logs = async () => {
      const { stdout: out, stderr } = await run('docker', ['logs', container], { maxBuffer: 64 * 1024 * 1024 });
      return `${out}${stderr}`;
    };
    return { container, origin, url: `${origin}/${edgeFunctionName}`, logs, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** 某个容器所在的 docker 网络（取第一个），供函数容器加入同一个网络直连数据库。 */
export async function containerNetwork(container: string): Promise<string> {
  const { stdout } = await run('docker', [
    'inspect',
    container,
    '--format',
    '{{range $name, $value := .NetworkSettings.Networks}}{{$name}}\n{{end}}'
  ]);
  const network = stdout.trim().split('\n')[0];
  if (!network) throw new Error(`Container ${container} is not on any docker network`);
  return network;
}
