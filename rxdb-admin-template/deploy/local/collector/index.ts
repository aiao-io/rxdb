/**
 * 本地预演栈的错误收集器（ADMIN-US-217 AC#7）：命令入口的 HTTP 上报器（`ADMIN_ERROR_REPORT_URL`）把脱敏后的错误报告 POST 到这里，
 * 收集器逐条追加到 `/var/log/collector/errors.jsonl`（宿主机上是 `.state/monitor/errors.jsonl`），并以 `GET /events` 原样交回。
 * 生产环境把这个地址换成真正的监控服务（自建收集器、日志平台的 HTTP 接入等）；报告在命令入口里就已脱敏，收集器不做二次处理。
 * 以 `supabase/edge-runtime` 的主服务运行（Deno，主服务有读写挂载目录的权限），不额外拉取镜像。
 */
declare const Deno: {
  serve(options: { port: number }, handler: (request: Request) => Promise<Response>): unknown;
  writeTextFile(path: string, data: string, options: { append: boolean; create: boolean }): Promise<void>;
  readTextFile(path: string): Promise<string>;
  errors: { NotFound: new (...args: unknown[]) => Error };
};

const file = '/var/log/collector/errors.jsonl';
/** 单条报告的上限：命令入口的报告不超过几 KB，超大的请求直接拒绝，防止把日志汇写满。 */
const limit = 64 * 1024;

async function events(): Promise<unknown[]> {
  try {
    const text = await Deno.readTextFile(file);
    return text
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as unknown);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
}

async function ingest(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > limit) return Response.json({ error: 'too_large' }, { status: 413 });
  let report: unknown;
  try {
    report = JSON.parse(body);
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const received = { receivedAt: new Date().toISOString(), report };
  await Deno.writeTextFile(file, `${JSON.stringify(received)}\n`, { append: true, create: true });
  return new Response(null, { status: 202 });
}

Deno.serve({ port: 9000 }, async request => {
  const { pathname } = new URL(request.url);
  if (request.method === 'POST' && pathname === '/ingest') return ingest(request);
  if (request.method === 'GET' && pathname === '/events') return Response.json(await events());
  if (request.method === 'GET' && pathname === '/health') return Response.json({ status: 'ok' });
  return Response.json({ error: 'not_found' }, { status: 404 });
});
