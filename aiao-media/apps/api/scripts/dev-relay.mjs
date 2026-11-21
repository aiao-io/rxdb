import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from '../src/local-first-worker.ts';
import { RelayTask } from '../src/relay-task.ts';
import { durableObjectNamespace, r2Bucket } from './cloudflare-stand-ins.mjs';

// 开发替身运行相同平台接口，任务只接收账号会话，模型凭据留在服务端环境。
// The allow-list committed for deployment, which `wrangler dev` starts from as well.
const deployedAllowList = () =>
  JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8')).vars.ALLOWED_PROVIDER_BASE_URLS;

function toRequest(incoming, signal) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers))
    if (typeof value === 'string') headers.set(name, value);
    else for (const item of value ?? []) headers.append(name, item);
  const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
  // The dev server proxy keeps the browser's Host, so the Worker's same-origin check compares like with like.
  return new Request(`http://${incoming.headers.host}${incoming.url}`, {
    method: incoming.method,
    headers,
    signal,
    ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {})
  });
}

async function send(response, outgoing) {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
  else outgoing.end();
}

/**
 * Starts the relay on a free loopback port and resolves once it is listening.
 * `allowedProviders` replaces the deployment allow-list, which tests use to stay offline.
 */
export async function startDevRelay({ allowedProviders, environment = process.env } = {}) {
  const env = {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => name.startsWith('MEDIA_'))),
    ALLOWED_PROVIDER_BASE_URLS: allowedProviders ? JSON.stringify(allowedProviders) : deployedAllowList(),
    RELAY_RESULTS: r2Bucket()
  };
  env.RELAY_TASKS = durableObjectNamespace(ctx => new RelayTask(ctx, env));
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController();
    // 浏览器断开只停止当前 HTTP 响应，不中止已经接单的上游任务。
    outgoing.once('close', () => {
      if (!outgoing.writableFinished) abort.abort();
    });
    try {
      // 未配置的产品服务明确返回不可用。
      const response =
        new URL(incoming.url, 'http://localhost').pathname.startsWith('/api/') ?
          await worker.fetch(toRequest(incoming, abort.signal), env)
        : Response.json({ error: 'Unknown API' }, { status: 404 });
      await send(response, outgoing);
    } catch {
      if (outgoing.headersSent) outgoing.destroy();
      else {
        outgoing.writeHead(502, { 'content-type': 'application/json' });
        outgoing.end(JSON.stringify({ error: 'Development relay failed' }));
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  // The relay only serves the dev server; it must not keep the process alive on its own.
  server.unref();
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      })
  };
}
