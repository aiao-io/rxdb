/** Worker 各路由共用的 HTTP 小工具。 */

/** 带 JSON 正文的响应。 */
export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 没有正文的 204。 */
export const noContent = (): Response => new Response(null, { status: 204 });

/** 请求头里的 Bearer token；没有时为 null。 */
export const bearerOf = (request: Request): string | null =>
  /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;

/** 405，`allow` 列出该路径接受的方法。 */
export const methodNotAllowed = (allow: string): Response =>
  new Response(JSON.stringify({ error: `allowed methods: ${allow}` }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow }
  });
