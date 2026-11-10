import { imageGenerationRequest, isMiniMaxImageProvider } from '@aiao-media/api-contracts';
import { Hono } from 'hono';
import { handleAdmin } from './admin-api.ts';
import { installation } from './installation.ts';
import { publishedTemplates, runtimePolicy } from './product-content.ts';
import { endpoint } from './product-http.ts';
import { base, json, relayInput } from './relay-input.ts';
import { handleRelayTask } from './relay-task-api.ts';
import type { WorkerEnv } from './worker-env.ts';

export { Installation } from './installation.ts';
export { PlatformCoordinator } from './platform-coordinator.ts';
export { RelayTask } from './relay-task.ts';
// Optional relay: stateless /api/relay for installed older pages, durable /api/relay/tasks for the current app.
// Static assets are served by the ASSETS binding.
type ProviderProbe = { elapsedMs: number } & (
  | { ok: true; status: number; contentType: string | null; allowOrigin: string | null }
  | { ok: false; error: string; detail: string }
);

async function probeProvider(url: string, init: RequestInit = {}): Promise<ProviderProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      // Workers supports follow/manual; error throws before any network I/O.
      redirect: 'manual',
      signal: controller.signal,
      ...init
    });
    await response.body?.cancel();
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get('content-type'),
      allowOrigin: response.headers.get('access-control-allow-origin'),
      elapsedMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.name : 'fetch_failed',
      // fetch failures carry no credentials; the message is what
      // distinguishes egress problems from provider problems.
      detail: error instanceof Error ? String(error.message).slice(0, 200) : '',
      elapsedMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}
async function providerProbe(env: WorkerEnv, origin: string) {
  let targets;
  try {
    targets = (JSON.parse(env.ALLOWED_PROVIDER_BASE_URLS || '[]') as string[]).map(base);
  } catch {
    return { error: 'Invalid provider configuration' };
  }
  if (!targets.length) return { error: 'No provider is enabled for this relay' };
  const checks = await Promise.all(
    targets.map(async target => {
      const imageRequest = imageGenerationRequest(target, {
        model: 'image-01',
        prompt: 'reachability-probe',
        size: '1024x1024'
      })!;
      const endpoint = imageRequest.url;
      // Server-to-server reachability is what the relay needs. A keyless POST
      // costs nothing: providers answer 401 and prove the path works. The
      // OPTIONS preflight only matters for browser-direct mode, which needs
      // provider CORS support that the relay never uses.
      const [root, api, preflight] = await Promise.all([
        probeProvider(`${target}/`),
        probeProvider(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            isMiniMaxImageProvider(target) ?
              imageRequest.body
            : {
                model: 'reachability-probe',
                prompt: 'reachability-probe',
                n: 1,
                size: '1024x1024'
              }
          )
        }),
        probeProvider(endpoint, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type'
          }
        })
      ]);
      return {
        target,
        root,
        api,
        preflight,
        reachable: root.ok && api.ok,
        browserDirect:
          preflight.ok &&
          preflight.status >= 200 &&
          preflight.status < 300 &&
          (preflight.allowOrigin === origin || preflight.allowOrigin === '*')
      };
    })
  );
  const controls = await Promise.all(
    ['https://example.com/', 'https://www.cloudflare.com/', 'https://api.openai.com/v1/models'].map(target =>
      probeProvider(target)
    )
  );
  const interpretation = [];
  if (!controls.every(check => check.ok))
    interpretation.push('Cloudflare could not reach every public control site; Worker egress may be degraded.');
  if (checks.every(check => check.reachable))
    interpretation.push(
      'Every enabled provider is reachable from Cloudflare; authenticated relay generation still needs verification.'
    );
  else interpretation.push('At least one provider is unreachable from Cloudflare; compare the per-provider checks.');
  const direct = checks.filter(check => check.browserDirect).length;
  interpretation.push(
    direct === checks.length ?
      'Browser-direct mode is available for every provider.'
    : `Browser-direct mode works for ${direct} of ${checks.length} providers; the rest must use relay (proxy) mode.`
  );
  return {
    checkedAt: new Date().toISOString(),
    controls,
    providers: checks,
    interpretation: interpretation.join(' ')
  };
}
const jsonPayload = (payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    }
  });
const encoder = new TextEncoder();
const navigationPaths = new Set(['/', '/create', '/images', '/providers']);
async function fetchAsset(request: Request, env: WorkerEnv) {
  const pathname = new URL(request.url).pathname;
  if (request.method === 'GET' && pathname === '/admin') return Response.redirect(new URL('/admin/', request.url), 302);
  if (request.method === 'GET' && pathname.startsWith('/admin/')) {
    const asset = pathname === '/admin/' ? new Request(new URL('/admin/index.html', request.url), request) : request;
    const result = await env.ASSETS!.fetch(asset);
    const headers = new Headers(result.headers);
    headers.set('cache-control', 'no-store');
    return new Response(result.body, { status: result.status, headers });
  }
  const setup = installation(env);
  let authUrl: string | undefined;
  if (setup && request.method === 'GET' && navigationPaths.has(pathname)) {
    const result = await setup.fetch(new Request(new URL('/api/installation', request.url)));
    if (!result.ok) return jsonPayload({ error: 'Installation unavailable' }, 503);
    const state = await result.json<{ initialized: boolean; auth: { url: string } | null }>();
    if (!state.initialized) return Response.redirect(new URL('/admin/', request.url), 302);
    authUrl = state.auth?.url;
  }
  const response = await env.ASSETS!.fetch(request);
  if (
    request.method === 'GET' &&
    (navigationPaths.has(pathname) ||
      pathname === '/offline-worker.js' ||
      pathname === '/offline-manifest.json' ||
      pathname === '/offline-shell.html')
  ) {
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    if (authUrl) {
      const auth = new URL(authUrl);
      const realtime = `${auth.protocol === 'https:' ? 'wss:' : 'ws:'}//${auth.host}`;
      const policy = headers.get('content-security-policy');
      if (policy)
        headers.set(
          'content-security-policy',
          policy.replace(/connect-src ([^;]*);/, `connect-src $1 ${auth.origin} ${realtime};`)
        );
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  return response;
}
const upstreamStatus = (status: number) => ([400, 401, 403, 404, 413, 422, 429].includes(status) ? status : 502);

// Image generation can take tens of seconds. Keep a slow upstream response alive
// after the edge has committed the response headers. Whitespace is valid JSON and
// is ignored by JSON.parse once the final provider payload arrives.
function lateRelayResponse(
  responsePromise: Promise<Response>,
  upstreamController: AbortController,
  cleanup: () => void
) {
  return new Response(
    new ReadableStream({
      async start(stream) {
        const heartbeat = setInterval(() => {
          try {
            stream.enqueue(encoder.encode(' \n'));
          } catch {
            clearInterval(heartbeat);
          }
        }, 8000);
        try {
          const response = await responsePromise;
          clearInterval(heartbeat);
          if (!response.ok) {
            await response.body?.cancel();
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  error: 'Provider rejected or failed; review provider history',
                  status: upstreamStatus(response.status)
                })
              )
            );
            stream.close();
            return;
          }
          if (!response.body || !response.headers.get('content-type')?.includes('application/json')) {
            await response.body?.cancel();
            stream.enqueue(
              encoder.encode(
                JSON.stringify({
                  error: 'Invalid provider response',
                  status: 502
                })
              )
            );
            stream.close();
            return;
          }
          const source = response.body.getReader();
          let total = 0;
          try {
            while (true) {
              const { done, value } = await source.read();
              if (done) break;
              total += value.byteLength;
              if (total > 24 * 1024 * 1024) throw new Error('Response too large');
              stream.enqueue(value);
            }
            stream.close();
          } catch (error) {
            await source.cancel().catch(() => undefined);
            stream.error(error);
          }
        } catch {
          stream.enqueue(
            encoder.encode(
              JSON.stringify({
                error: 'Provider connection interrupted; review provider history before retrying',
                status: 502
              })
            )
          );
          stream.close();
        } finally {
          clearInterval(heartbeat);
          cleanup();
        }
      },
      cancel() {
        upstreamController.abort();
        cleanup();
      }
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-aiao-relay-stream': 'late-upstream'
      }
    }
  );
}
type ApiEnv = { Bindings: WorkerEnv };
const app = new Hono<ApiEnv>();

async function configuredEnvironment(env: WorkerEnv): Promise<WorkerEnv> {
  const setup = installation(env);
  if (!setup) return env;
  const installed = await setup.fetch('https://installation/internal/config');
  if (!installed.ok) throw new Error('Installation configuration unavailable');
  const config = await installed.json<Partial<WorkerEnv> | null>();
  return config ? { ...env, ...config } : env;
}

async function withConfiguredEnvironment(
  env: WorkerEnv,
  handler: (configured: WorkerEnv) => Promise<Response>
): Promise<Response> {
  try {
    return await handler(await configuredEnvironment(env));
  } catch {
    return json(503, 'Installation configuration unavailable');
  }
}

async function relay(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') return json(405, 'POST required');
  let input;
  try {
    input = await relayInput(request, env);
  } catch {
    return json(502, 'Provider connection interrupted; review provider history before retrying');
  }
  if (input instanceof Response) return input;
  const { authorization, imageRequest, policy } = input;
  const controller = new AbortController();
  const stop = () => controller.abort();
  request.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, 180000);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', stop);
  };
  try {
    if (request.signal.aborted) throw new Error('Aborted');
    const responsePromise = fetch(imageRequest.url, {
      method: 'POST',
      // 不跟随重定向携带 Key；即时和延迟响应路径都统一拒绝非 2xx。
      redirect: 'manual',
      signal: controller.signal,
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(imageRequest.body)
    });
    const early = await Promise.race([
      responsePromise
        .then(response => ({ kind: 'response' as const, response }))
        .catch(error => ({ kind: 'error' as const, error })),
      new Promise<{ kind: 'pending' }>(resolve => setTimeout(() => resolve({ kind: 'pending' }), 250))
    ]);
    if (early.kind === 'pending') {
      const response = lateRelayResponse(responsePromise, controller, cleanup);
      response.headers.set('x-aiao-policy-version', String(policy?.revision ?? 'deployment'));
      return response;
    }
    if (early.kind === 'error') throw early.error;
    const response = early.response;
    if (!response.ok) {
      await response.body?.cancel();
      cleanup();
      return json(
        [400, 401, 403, 404, 413, 422, 429].includes(response.status) ? response.status : 502,
        'Provider rejected or failed; review provider history'
      );
    }
    if (!response.body || !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      cleanup();
      return json(502, 'Invalid provider response');
    }
    const source = response.body.getReader();
    let total = 0;
    const body = new ReadableStream({
      async pull(target) {
        try {
          const { done, value } = await source.read();
          if (done) {
            cleanup();
            target.close();
            return;
          }
          total += value.length;
          if (total > 24 * 1024 * 1024) throw new Error('Response too large');
          target.enqueue(value);
        } catch {
          controller.abort();
          await source.cancel().catch(() => undefined);
          cleanup();
          target.error(new Error('Provider stream interrupted'));
        }
      },
      async cancel() {
        controller.abort();
        cleanup();
        await source.cancel().catch(() => undefined);
      }
    });
    return new Response(body, {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-aiao-policy-version': String(policy?.revision ?? 'deployment')
      }
    });
  } catch {
    cleanup();
    return json(502, 'Provider connection interrupted; review provider history before retrying');
  }
}

app.options('/api/*', c => {
  const origin = c.req.header('origin');
  if (origin !== 'tauri://localhost' || c.env.MEDIA_ALLOW_DESKTOP_ORIGIN !== 'true') return json(403, 'Origin is not enabled');
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,PUT,DELETE',
      'access-control-allow-headers': 'authorization,content-type,x-provider-base,x-relay-task-token',
      'access-control-max-age': '600',
      vary: 'Origin'
    }
  });
});

app.all('/api/installation', async c => {
  const setup = installation(c.env);
  if (setup) return setup.fetch(c.req.raw);
  return jsonPayload({
    initialized: true,
    managed: Boolean(c.env.MEDIA_SUPABASE_URL),
    auth:
      c.env.MEDIA_SUPABASE_URL && c.env.MEDIA_SUPABASE_ANON_KEY ?
        { url: c.env.MEDIA_SUPABASE_URL, anonKey: c.env.MEDIA_SUPABASE_ANON_KEY }
      : null
  });
});

app.all('/api/admin/*', c => withConfiguredEnvironment(c.env, env => handleAdmin(c.req.raw, env)));
app.get('/api/templates', c => withConfiguredEnvironment(c.env, env => endpoint(() => publishedTemplates(env))));
app.get('/api/provider-policies', c =>
  withConfiguredEnvironment(c.env, env => endpoint(async () => ({ policy: await runtimePolicy(env) })))
);
app.all('/api/provider-probe', async c => {
  if (c.req.method !== 'GET') return json(405, 'GET required');
  const env = await configuredEnvironment(c.env).catch(() => null);
  if (!env) return json(503, 'Installation configuration unavailable');
  return jsonPayload(await providerProbe(env, new URL(c.req.url).origin));
});
app.all('/api/relay/tasks/*', c => withConfiguredEnvironment(c.env, env => handleRelayTask(c.req.raw, env)));
app.all('/api/relay', c => withConfiguredEnvironment(c.env, env => relay(c.req.raw, env)));
app.all('/api/*', () => json(404, 'Unknown API'));
app.all('*', c => fetchAsset(c.req.raw, c.env));

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const origin = request.headers.get('origin');
    const desktop = origin === 'tauri://localhost' && env.MEDIA_ALLOW_DESKTOP_ORIGIN === 'true';
    if (request.method === 'OPTIONS' && new URL(request.url).pathname.startsWith('/api/')) {
      if (!desktop) return json(403, 'Origin is not enabled');
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin!,
          'access-control-allow-methods': 'GET,POST,PUT,DELETE',
          'access-control-allow-headers': 'authorization,content-type,x-provider-base,x-relay-task-token',
          'access-control-max-age': '600',
          vary: 'Origin'
        }
      });
    }
    const result = await app.fetch(request, env);
    if (!desktop || !new URL(request.url).pathname.startsWith('/api/')) return result;
    const headers = new Headers(result.headers);
    headers.set('access-control-allow-origin', origin!);
    headers.set('vary', 'Origin');
    return new Response(result.body, { status: result.status, headers });
  }
} satisfies ExportedHandler<WorkerEnv>;
