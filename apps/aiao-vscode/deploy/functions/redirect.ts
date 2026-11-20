import { isGitHubOAuthDesktopOrigin } from '../../src/workbench/git/github/github-desktop-oauth.ts';

/** Pages Function 的最小上下文类型；无需引入 @cloudflare/workers-types。 */
interface PagesContext {
  readonly request: Request;
  readonly env: Record<string, string | undefined>;
}

/**
 * GET /redirect：GitHub OAuth 回跳落点。
 * 校验 state 指向本站回调；桌面请求只允许转到已批准来源的固定回跳页。
 */
export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const states = url.searchParams.getAll('state');
  const codes = url.searchParams.getAll('code');
  const errors = url.searchParams.getAll('error');
  const state = states[0];
  const code = codes[0] ?? null;
  const error = errors[0] ?? null;
  if (
    states.length !== 1 ||
    !state ||
    state.length > 2048 ||
    codes.length > 1 ||
    errors.length > 1 ||
    Boolean(code) === Boolean(error) ||
    (code !== null && (code.length === 0 || code.length > 4096)) ||
    (error !== null && (error.length === 0 || error.length > 256))
  ) {
    return new Response('No valid state or code query parameter provided', { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(state);
  } catch {
    return new Response('Invalid state', { status: 400 });
  }
  // 防开放重定向：state 只能是本站回调路由
  if (target.origin !== url.origin || target.pathname !== '/github-callback' || target.username || target.password || target.hash) {
    return new Response('Invalid state redirect target', { status: 400 });
  }
  const desktop = target.searchParams.get('desktop');
  if (desktop !== null) return returnToDesktop(desktop, target, state, code, error);
  if (!code || target.searchParams.toString().length > 2048) {
    return new Response('No code query parameter provided', { status: 400 });
  }
  target.searchParams.set('state', state);
  target.searchParams.set('code', code);
  return Response.redirect(target.toString(), 302);
}

function returnToDesktop(
  desktop: string,
  target: URL,
  state: string,
  code: string | null,
  error: string | null
): Response {
  const names = [...target.searchParams.keys()].sort();
  if (
    !isGitHubOAuthDesktopOrigin(desktop) ||
    target.searchParams.getAll('desktop').length !== 1 ||
    target.searchParams.getAll('nonce').length !== 1 ||
    names.join(',') !== 'desktop,nonce' ||
    !/^[0-9a-f]{32}$/.test(target.searchParams.get('nonce') ?? '')
  ) {
    return new Response('Invalid desktop OAuth callback', { status: 400 });
  }
  const callback = new URL('/github-oauth-return.html', desktop);
  callback.hash = new URLSearchParams(
    code ? { state, code } : { state, error: error === 'access_denied' ? error : 'oauth_failed' }
  ).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: callback.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}
