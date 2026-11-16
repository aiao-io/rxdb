import { demand } from '../model.js';
/** 防止部署配置误把服务端凭据暴露到浏览器的公开配置接口。 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_publishable_')) return;
  let role: unknown;
  try {
    role = (JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')) as { role?: unknown }).role;
  } catch {
    role = undefined;
  }
  demand(role === 'anon', 'configuration', 'SUPABASE_ANON_KEY 必须是公开 anon 或 publishable key');
}
