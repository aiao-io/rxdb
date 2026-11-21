import type { WorkerEnv } from './worker-env.ts';

/** 代理接口的错误响应：不缓存、不带 referrer。 */
export const json = (status: number, error: string) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer'
      }
    }
  );

/** 规范化供应商 API 前缀，只接受不含凭据、查询和片段的 HTTPS 地址。 */
export function base(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid base');
  return url.href.replace(/\/+$/, '');
}

/** 读取部署级供应商边界，发布策略只能缩小这个集合。 */
export function providerAllowlist(env: WorkerEnv) {
  const values = JSON.parse(env.ALLOWED_PROVIDER_BASE_URLS || '[]');
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('Invalid allowlist');
  return new Set(values.map(base));
}
