import { isGitHubOAuthDesktopOrigin } from '../../../src/workbench/git/github/github-desktop-oauth.ts';

/** Pages Function 的最小上下文类型；无需引入 @cloudflare/workers-types。 */
interface PagesContext {
  readonly request: Request;
  readonly env: Record<string, string | undefined>;
}

const REDIRECT_PATH = '/redirect';
const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Accept, Content-Type';

/** 返回发起 OAuth 所需的公开 Client ID；secret 始终留在服务端。 */
export function onRequestGet({ request, env }: PagesContext): Response {
  const cors = corsHeaders(request);
  if (cors instanceof Response) return cors;
  const clientId = env['GITHUB_CLIENT_ID']?.trim();
  if (!clientId || clientId === 'pending-aiao-vscode-oauth-app') {
    return json(
      { error: 'GitHub OAuth client ID is not configured on this deployment' },
      503,
      cors
    );
  }
  return json({ clientId }, 200, cors);
}

/** 浏览器跨源 POST 的预检响应。 */
export function onRequestOptions({ request }: PagesContext): Response {
  const cors = corsHeaders(request);
  if (cors instanceof Response) return cors;
  return new Response(null, { status: 204, headers: cors });
}

/**
 * POST /api/github-token：用服务端持有的 client secret 交换授权码；
 * POST /api/github-token/delete：服务端撤销 OAuth token。
 * secret 经 `wrangler pages secret put` 注入，永不进入前端或仓库。
 */
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const cors = corsHeaders(context.request);
  if (cors instanceof Response) return cors;
  const url = new URL(context.request.url);
  const response = url.pathname.endsWith('/delete') ? await revokeToken(context) : await exchangeCode(context);
  return withHeaders(response, cors);
}

function corsHeaders(request: Request): Headers | Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const origin = request.headers.get('Origin');
  if (origin === null) return headers;

  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && !isGitHubOAuthDesktopOrigin(origin)) {
    return new Response('Origin not allowed', { status: 403, headers });
  }
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Vary', 'Origin');
  return headers;
}

function json(value: unknown, status: number, headers: Headers): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: new Headers([...headers, ['Content-Type', 'application/json']])
  });
}

function withHeaders(response: Response, headers: Headers): Response {
  const merged = new Headers(response.headers);
  for (const [name, value] of headers) merged.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

function credentials(env: PagesContext['env']): { clientId: string; clientSecret: string } | Response {
  const clientId = env['GITHUB_CLIENT_ID']?.trim();
  const clientSecret = env['GITHUB_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth credentials are not configured on this deployment', { status: 500 });
  }
  return { clientId, clientSecret };
}

async function exchangeCode({ request, env }: PagesContext): Promise<Response> {
  const config = credentials(env);
  if (config instanceof Response) return config;
  let body: { code?: unknown; code_verifier?: unknown; redirect_uri?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  const { code, code_verifier: verifier, redirect_uri: redirectUri } = body;
  const expectedRedirectUri = `${new URL(request.url).origin}${REDIRECT_PATH}`;
  if (
    typeof code !== 'string' ||
    code.length === 0 ||
    code.length > 4096 ||
    typeof verifier !== 'string' ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
    redirectUri !== expectedRedirectUri
  ) {
    return new Response('Invalid code, code_verifier or redirect_uri', { status: 400 });
  }
  const form = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: verifier,
    redirect_uri: redirectUri
  });
  let response: Response;
  try {
    response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
  } catch {
    return new Response('GitHub token exchange failed', { status: 502 });
  }
  if (!response.ok) {
    return new Response(await response.text(), {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  let json: { access_token?: unknown };
  try {
    json = (await response.json()) as { access_token?: unknown };
  } catch {
    return new Response('Token exchange returned invalid JSON', { status: 502 });
  }
  if (typeof json.access_token !== 'string' || !json.access_token) {
    return new Response('Token exchange returned no access_token', { status: 502 });
  }
  return Response.json({ access_token: json.access_token });
}

async function revokeToken({ request, env }: PagesContext): Promise<Response> {
  const config = credentials(env);
  if (config instanceof Response) return config;
  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }
  if (typeof body.token !== 'string' || !body.token) {
    return new Response('Missing token', { status: 400 });
  }
  const auth = btoa(`${config.clientId}:${config.clientSecret}`);
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/applications/${config.clientId}/token`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'aiao-vscode'
      },
      body: JSON.stringify({ access_token: body.token })
    });
  } catch {
    return new Response('GitHub token revoke failed', { status: 502 });
  }
  if (!response.ok && response.status !== 404) {
    return new Response(await response.text(), {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  return Response.json({ ok: true });
}
