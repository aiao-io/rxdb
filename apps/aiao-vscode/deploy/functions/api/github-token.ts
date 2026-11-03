/** Pages Function 的最小上下文类型；无需引入 @cloudflare/workers-types。 */
interface PagesContext {
  readonly request: Request;
  readonly env: Record<string, string | undefined>;
}

/**
 * POST /api/github-token：用服务端持有的 client secret 交换授权码；
 * POST /api/github-token/delete：服务端撤销 OAuth token。
 * secret 经 `wrangler secret put` 注入，永不进入前端或仓库。
 */
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  if (url.pathname.endsWith('/delete')) return revokeToken(context);
  return exchangeCode(context);
}

function credentials(env: PagesContext['env']): { clientId: string; clientSecret: string } | Response {
  const clientId = env['GITHUB_CLIENT_ID'];
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
  if (
    typeof code !== 'string' ||
    !code ||
    typeof verifier !== 'string' ||
    !verifier ||
    typeof redirectUri !== 'string' ||
    !redirectUri
  ) {
    return new Response('Missing code, code_verifier or redirect_uri', { status: 400 });
  }
  const form = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: verifier,
    redirect_uri: redirectUri
  });
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  if (!response.ok) {
    return new Response(await response.text(), {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  const json = (await response.json()) as { access_token?: string };
  if (typeof json.access_token !== 'string') {
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
  const response = await fetch(`https://api.github.com/applications/${config.clientId}/token`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Basic ${auth}`,
      'User-Agent': 'aiao-vscode'
    },
    body: JSON.stringify({ access_token: body.token })
  });
  if (!response.ok && response.status !== 404) {
    return new Response(await response.text(), {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  return Response.json({ ok: true });
}
