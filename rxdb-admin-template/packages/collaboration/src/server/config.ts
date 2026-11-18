import { demand } from '../model.js';
import { base64UrlJson } from './encoding.js';
import { isServiceRoleUser } from './service-role.js';

/** 防止部署配置误把服务端凭据暴露到浏览器的公开配置接口。 */
export function assertPublicKey(key: string): void {
  if (key.startsWith('sb_publishable_')) return;
  let role: unknown;
  try {
    role = (base64UrlJson(key.split('.')[1] ?? '') as { role?: unknown } | null)?.role;
  } catch {
    role = undefined;
  }
  demand(role === 'anon', 'configuration', 'SUPABASE_ANON_KEY 必须是公开 anon 或 publishable key');
}

/**
 * 命令入口的数据库连接必须用协作专用角色（迁移 `202611180001_service_role.sql`）：直连时用户名就是角色名，
 * 经 Supavisor 时为 `<角色>.<项目 ref>`。误填 postgres、service_role 或其他角色的连接串时启动即失败，不带着过大的权限运行。
 */
export function assertServiceConnection(connection: string): void {
  // 变量名只放在错误详情里：词条会随三端前端产物下发，不能出现服务端变量名
  demand(
    isServiceRoleUser(connectionUser(connection)),
    'configuration',
    '命令入口的数据库连接必须使用协作专用数据库角色',
    {
      variables: ['ADMIN_DATABASE_URL']
    }
  );
}
/** 连接串里的用户名；连接串格式不合法时为空。 */
function connectionUser(connection: string): string {
  try {
    return decodeURIComponent(new URL(connection).username);
  } catch {
    return '';
  }
}
