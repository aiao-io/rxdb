/**
 * 本机 `supabase/edge-runtime` 的主服务（Deno），仿照 Supabase CLI 本地起函数时的主服务：按路径第一段把请求交给
 * `/home/deno/functions/<函数名>` 的用户 worker，并按线上的限额创建 worker——每个请求 2 秒 CPU（软限 1 秒）、256 MB 内存，
 * 平台层的失败按线上的状态码回应：启动失败 503 BOOT_ERROR、worker 报错 500 WORKER_ERROR、触及资源上限 546 WORKER_LIMIT。
 * 不在网关层校验 JWT（与 `--no-verify-jwt` 部署一致）：命令入口自己本地验签，`GET /config` 也不需要令牌。
 *
 * 只给资源测量用的开关（默认关闭，契约测试与 E2E 不用）：`EDGE_FRESH_WORKER=1` 让每个请求都由新建的 worker 处理、响应后立即回收，
 * 事件 worker 因此逐请求记下 CPU 时间与内存；`EDGE_CPU_SOFT_LIMIT_MS`、`EDGE_CPU_HARD_LIMIT_MS`、`EDGE_MEMORY_LIMIT_MB`
 * 收紧限额，用来测余量。
 */
interface UserWorker {
  fetch(request: Request): Promise<Response>;
}
interface WorkerOptions {
  servicePath: string;
  memoryLimitMb: number;
  workerTimeoutMs: number;
  noModuleCache: boolean;
  envVars: [string, string][];
  forceCreate: boolean;
  cpuTimeSoftLimitMs: number;
  cpuTimeHardLimitMs: number;
}
declare const EdgeRuntime: {
  userWorkers: {
    create(options: WorkerOptions): Promise<UserWorker>;
    tryCleanupIdleWorkers(timeoutMs: number): Promise<number>;
  };
};
declare const Deno: {
  env: { get(name: string): string | undefined; toObject(): Record<string, string> };
  errors: Record<string, (new (...args: unknown[]) => Error) | undefined>;
  serve(handler: (request: Request) => Promise<Response>): unknown;
};

const setting = (name: string, value: number) => Number(Deno.env.get(name) ?? value);
const limits = {
  memoryLimitMb: setting('EDGE_MEMORY_LIMIT_MB', 256),
  cpuTimeSoftLimitMs: setting('EDGE_CPU_SOFT_LIMIT_MS', 1000),
  cpuTimeHardLimitMs: setting('EDGE_CPU_HARD_LIMIT_MS', 2000),
  workerTimeoutMs: setting('EDGE_WALL_CLOCK_LIMIT_MS', 150_000)
};
const fresh = Deno.env.get('EDGE_FRESH_WORKER') === '1';
/** 交给用户 worker 的环境变量：去掉主机相关与主服务自己的设置，与 Supabase CLI 的做法一致。 */
const envVars = Object.entries(Deno.env.toObject()).filter(
  ([name]) => !['HOME', 'HOSTNAME', 'PATH', 'PWD'].includes(name) && !name.startsWith('EDGE_')
);
/** Edge Runtime 的错误类型到平台状态码（同 Supabase CLI 主服务）。 */
const platformErrors: [string, number, string, string][] = [
  ['InvalidWorkerCreation', 503, 'BOOT_ERROR', 'Worker failed to boot (please check logs)'],
  ['InvalidWorkerResponse', 500, 'WORKER_ERROR', 'Function exited due to an error (please check logs)'],
  [
    'WorkerRequestCancelled',
    546,
    'WORKER_LIMIT',
    'Worker failed to respond due to a resource limit (please check logs)'
  ]
];
function platformError(error: unknown): Response {
  console.error(error);
  for (const [name, status, code, message] of platformErrors) {
    const type = Deno.errors[name];
    if (type && error instanceof type) return Response.json({ code, message }, { status });
  }
  return Response.json(
    { code: 'Internal Server Error', message: 'Request failed due to an internal server error' },
    { status: 500 }
  );
}

async function serve(request: Request): Promise<Response> {
  const name = new URL(request.url).pathname.split('/')[1];
  if (name === '_internal') return Response.json({ message: 'ok' });
  if (!name || !/^[a-z0-9-]+$/.test(name)) return Response.json({ msg: 'Function not found' }, { status: 404 });
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      ...limits,
      noModuleCache: false,
      envVars,
      forceCreate: fresh
    });
    const response = await worker.fetch(request);
    if (!fresh) return response;
    // 测量模式：读完响应再回收 worker，事件 worker 随即收到这个 worker 的 Shutdown 事件（含 CPU 时间与内存）。
    // 响应刚结束时 worker 偶尔还没转为空闲、回收落空，这时它到墙钟上限（测量时设得很短）才关闭，事件晚到但不会丢
    const body = await response.arrayBuffer();
    await EdgeRuntime.userWorkers.tryCleanupIdleWorkers(0);
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    return platformError(error);
  }
}

Deno.serve(serve);
