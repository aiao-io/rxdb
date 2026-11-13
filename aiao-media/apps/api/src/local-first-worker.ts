import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import { handleAdmin } from './admin-api.ts';
import { configuredEnvironment } from './configured-environment.ts';
import { handleCredits } from './credits-api.ts';
import { installation } from './installation.ts';
import { apiRoutes, openApiDocument } from './openapi.ts';
import { platformCatalog } from './platform-models.ts';
import { publishedTemplates } from './product-content.ts';
import { endpoint } from './product-http.ts';
import { json } from './relay-input.ts';
import { handleRelayTask } from './relay-task-api.ts';
import type { WorkerEnv } from './worker-env.ts';

export { Installation } from './installation.ts';
export { PlatformCoordinator } from './platform-coordinator.ts';
export { RelayTask } from './relay-task.ts';
// 平台生成只经持久任务接单，静态资源由 ASSETS 提供。
const jsonPayload = (payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    }
  });
const adminContentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; connect-src 'self' https: wss:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const navigationPaths = new Set(['/', '/create', '/images', '/providers']);
async function fetchAsset(request: Request, env: WorkerEnv) {
  const pathname = new URL(request.url).pathname;
  if (request.method === 'GET' && pathname === '/admin') return Response.redirect(new URL('/admin/', request.url), 302);
  if (request.method === 'GET' && pathname.startsWith('/admin/')) {
    const asset = pathname === '/admin/' ? new Request(new URL('/admin/index.html', request.url), request) : request;
    const result = await env.ASSETS!.fetch(asset);
    const headers = new Headers(result.headers);
    headers.set('cache-control', 'no-store');
    headers.set('content-security-policy', adminContentSecurityPolicy);
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
type ApiEnv = { Bindings: WorkerEnv };
const app = new OpenAPIHono<ApiEnv>();
for (const route of Object.values(apiRoutes)) app.openAPIRegistry.registerPath(route);
app.doc31('/api/openapi.json', openApiDocument);
app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));

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

app.options('/api/*', c => {
  const origin = c.req.header('origin');
  if (origin !== 'tauri://localhost' || c.env.MEDIA_ALLOW_DESKTOP_ORIGIN !== 'true')
    return json(403, 'Origin is not enabled');
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,PUT,DELETE',
      'access-control-allow-headers': 'authorization,content-type,x-relay-task-token',
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
    bootstrapRequired: false,
    auth:
      c.env.MEDIA_SUPABASE_URL && c.env.MEDIA_SUPABASE_ANON_KEY ?
        { url: c.env.MEDIA_SUPABASE_URL, anonKey: c.env.MEDIA_SUPABASE_ANON_KEY }
      : null
  });
});

app.get('/api/models', c => withConfiguredEnvironment(c.env, env => endpoint(() => platformCatalog(env))));
app.all('/api/credits', c => withConfiguredEnvironment(c.env, env => handleCredits(c.req.raw, env)));
app.all('/api/admin/*', c => withConfiguredEnvironment(c.env, env => handleAdmin(c.req.raw, env)));
app.get('/api/templates', c => withConfiguredEnvironment(c.env, env => endpoint(() => publishedTemplates(env))));
app.all('/api/relay/tasks/*', c => withConfiguredEnvironment(c.env, env => handleRelayTask(c.req.raw, env)));
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
          'access-control-allow-headers': 'authorization,content-type,x-relay-task-token',
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
