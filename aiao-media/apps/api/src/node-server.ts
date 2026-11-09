import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import worker from './local-first-worker.ts';
import { NodeRelayRuntime } from './node-runtime.ts';
import type { WorkerEnv } from './worker-env.ts';

/** 国内 HTTP 入口固定公开 origin，任务的上游请求独立于浏览器连接。 */
export async function startNodeServer(environment: NodeJS.ProcessEnv = process.env) {
  const origin = new URL(environment['MEDIA_PUBLIC_ORIGIN']!).origin;
  const runtime = new NodeRelayRuntime({ directory: environment['MEDIA_DATA_DIRECTORY']!, maxConcurrent: 2 });
  await runtime.start();
  const env: WorkerEnv = {
    ...runtime.bindings(),
    MEDIA_SUPABASE_URL: environment['MEDIA_SUPABASE_URL'],
    MEDIA_SUPABASE_ANON_KEY: environment['MEDIA_SUPABASE_ANON_KEY'],
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: environment['MEDIA_SUPABASE_SERVICE_ROLE_KEY'],
    MEDIA_ALLOW_DESKTOP_ORIGIN: 'true',
    ALLOWED_PROVIDER_BASE_URLS: environment['ALLOWED_PROVIDER_BASE_URLS']
  };
  const handle = async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    const abort = new AbortController();
    outgoing.on('close', () => abort.abort());
    const method = incoming.method ?? 'GET';
    const url = new URL(incoming.url ?? '/', origin);
    if (url.origin !== origin) {
      outgoing.writeHead(400).end();
      return;
    }
    if (url.pathname === '/api/health') {
      outgoing.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, String(value));
    const init: RequestInit & { duplex: 'half' } = {
      method,
      headers,
      duplex: 'half',
      signal: abort.signal,
      ...(['GET', 'HEAD'].includes(method) ? {} : { body: Readable.toWeb(incoming) as ReadableStream<Uint8Array> })
    };
    const response = await worker.fetch(new Request(url, init), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) {
      outgoing.end();
      return;
    }
    await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), outgoing);
  };
  const server = createServer((incoming, outgoing) => {
    void handle(incoming, outgoing).catch(() => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.listen(Number(environment['PORT'] ?? 8787), environment['LISTEN_HOST'] ?? '127.0.0.1');
  const close = async () => {
    const closed = new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    await closed;
    await runtime.close();
  };
  return { server, runtime, close };
}
