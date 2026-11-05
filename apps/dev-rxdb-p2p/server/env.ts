/** Worker 的绑定与配置（`wrangler.jsonc` 的 vars / secrets / bindings）。 */
import type { SupabaseAuthConfig } from './identity';
import type { DurableObjectNamespaceLike, R2BucketLike } from './runtime';

/** Worker 环境。 */
export interface Env {
  /** Supabase 项目地址。 */
  readonly SUPABASE_URL: string;
  /** Supabase 公开的 anon / publishable key。 */
  readonly SUPABASE_ANON_KEY: string;
  /** secret：签发连接票据的 Ed25519 私钥 JWK。 */
  readonly TICKET_PRIVATE_JWK: string;
  /** secret：Supabase 的 service role key，只给管理后台用；缺失时管理接口报未配置。 */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  /** secret：管理员的 Supabase 用户 id，逗号或空白分隔；缺失时管理接口报未配置。 */
  readonly ADMIN_USER_IDS?: string;
  /** 信令 Durable Object。 */
  readonly SIGNALING: DurableObjectNamespaceLike;
  /** 服务器回退的文件桶。 */
  readonly FILES: R2BucketLike;
}

/**
 * 访问 Supabase 的参数。
 *
 * @throws Error 缺少 `SUPABASE_URL` 或 `SUPABASE_ANON_KEY`
 */
export const supabaseConfigOf = (env: Env): SupabaseAuthConfig => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured');
  }
  // workerd 的 fetch 不能脱离全局对象调用（Illegal invocation），这里包一层。
  return {
    url: env.SUPABASE_URL.replace(/\/+$/, ''),
    anonKey: env.SUPABASE_ANON_KEY,
    fetch: (input, init) => fetch(input, init)
  };
};
