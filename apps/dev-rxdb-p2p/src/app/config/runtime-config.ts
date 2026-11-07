/**
 * 运行时配置：Worker 的 `/app-config.js` 在应用脚本之前写入 `globalThis.__P2P_CONFIG__`，
 * 同一份构建产物换个部署环境不必重新构建。
 */

/** 前端需要的公开配置。 */
export interface P2PRuntimeConfig {
  /** Supabase 项目地址。 */
  readonly supabaseUrl: string;
  /** Supabase 公开的 anon / publishable key。 */
  readonly supabaseAnonKey: string;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * 读取运行时配置。
 *
 * @param scope - 挂配置的全局对象（测试传替身）
 * @throws Error `/app-config.js` 没加载，或缺少字段
 */
export const readRuntimeConfig = (scope: object = globalThis): P2PRuntimeConfig => {
  const config = (scope as { __P2P_CONFIG__?: Partial<Record<keyof P2PRuntimeConfig, unknown>> }).__P2P_CONFIG__;
  if (!config) throw new Error('/app-config.js did not load: the Worker serves it, start the app through wrangler');
  const { supabaseUrl, supabaseAnonKey } = config;
  if (!isText(supabaseUrl) || !isText(supabaseAnonKey)) {
    throw new Error('/app-config.js must define supabaseUrl and supabaseAnonKey');
  }
  return { supabaseUrl, supabaseAnonKey };
};
