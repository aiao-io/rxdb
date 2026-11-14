/** Pages Function 的最小上下文类型；无需引入 @cloudflare/workers-types。 */
interface PagesContext {
  readonly request: Request;
  readonly env: Record<string, string | undefined>;
}

/**
 * GET /redirect：GitHub OAuth 回跳落点。
 * 校验 state 必须回到本站 /github-callback 路由，然后 302 把 code 与 state 带回 SPA。
 */
export async function onRequestGet({ request }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code) {
    return new Response('No state or code query parameter provided', { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(state);
  } catch {
    return new Response('Invalid state', { status: 400 });
  }
  // 防开放重定向：state 只能是本站回调路由
  if (target.origin !== url.origin || !target.pathname.startsWith('/github-callback')) {
    return new Response('Invalid state redirect target', { status: 400 });
  }
  target.searchParams.set('state', state);
  target.searchParams.set('code', code);
  return Response.redirect(target.toString(), 302);
}
