import { CollaborationError } from '../model.js';
import type { AuthLookup } from './identity.js';

/** GoTrue 返回的用户里，接受邀请时用到的字段。 */
interface AuthUser {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
}

/**
 * 接受邀请时向 Supabase Auth 确认账号（`GET <SUPABASE_URL>/auth/v1/user`）：与 supabase-js 的 `auth.getUser(token)` 同一个接口与同样的结果形状，
 * 只用 `fetch`，命令入口因此不必把 supabase-js 打进 Edge Function。用公开 key（`apikey`）与用户自己的 access token 调用，不用 service role。
 * Auth 拒绝该令牌（4xx）时返回 `user: null` 加错误，由调用方按会话失效处理；Auth 不可达或 5xx 时抛出 `unavailable`，客户端按原请求重试。
 */
export function authLookup(options: { url: string; key: string; fetch?: typeof globalThis.fetch }): AuthLookup {
  const request = options.fetch ?? fetch;
  const endpoint = `${options.url.replace(/\/+$/, '')}/auth/v1/user`;
  const unavailable = () => new CollaborationError('unavailable', '服务暂时不可用，请稍后按原请求重试');
  return {
    async getUser(token) {
      const response = await request(endpoint, {
        headers: { apikey: options.key, authorization: `Bearer ${token}`, accept: 'application/json' }
      }).catch(() => {
        throw unavailable();
      });
      if (response.status >= 500) throw unavailable();
      if (!response.ok) return { data: { user: null }, error: { status: response.status } };
      const user = (await response.json()) as AuthUser;
      if (typeof user.id !== 'string') return { data: { user: null }, error: { status: response.status } };
      return {
        data: {
          user: {
            id: user.id,
            email: typeof user.email === 'string' ? user.email : undefined,
            email_confirmed_at: typeof user.email_confirmed_at === 'string' ? user.email_confirmed_at : null
          }
        },
        error: null
      };
    }
  };
}
