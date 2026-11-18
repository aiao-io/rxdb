import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { demand } from '../model.js';
import { parseSchemaManifest } from '../schema.js';
import { archiveAudit, auditArchivePolicy } from './audit-archive.js';
import { applyMigrations } from './migrate.js';
import { CollaborationRepository } from './repository.js';
import { servicePasswordStatement } from './service-role.js';

/**
 * 部署期的一次性命令行，以迁移所有者的连接（`ADMIN_OWNER_DATABASE_URL`，Supabase 的 postgres 角色，直连或 session 模式）执行，
 * 不在命令入口里运行：
 * - `--migrate`：按文件名顺序执行全部迁移；
 * - `--service-password`：设置协作专用数据库角色的口令并允许它登录（口令取自 `ADMIN_SERVICE_PASSWORD`，只以 SCRAM 校验值发给数据库）；
 * - `--archive-audit`：按策略把审计热表里的旧事件分批移入归档表（`ADMIN_AUDIT_ARCHIVE_AFTER_DAYS` / `ADMIN_AUDIT_KEEP_LATEST`，
 *   至少给一个，`ADMIN_AUDIT_ARCHIVE_BATCH` 可选，见 `audit-archive.ts`），可定期执行，重跑幂等；
 * - 不带参数：初始化一个团队工作区（还需要 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 等，见协作包 README）。
 * 命令入口本身只用专用角色的连接（`ADMIN_DATABASE_URL`），读不到初始化密钥，也不能新建工作区。
 */
const required = (name: string) => {
  const value = process.env[name];
  demand(value, 'configuration', `缺少环境变量 ${name}`);
  return value;
};
const pool = new pg.Pool({ connectionString: required('ADMIN_OWNER_DATABASE_URL'), max: 1 });
try {
  if (process.argv.includes('--migrate')) {
    console.info('Collaboration migrations applied:', (await applyMigrations(pool)).join(', '));
  } else if (process.argv.includes('--service-password')) {
    await pool.query(await servicePasswordStatement(required('ADMIN_SERVICE_PASSWORD')));
    console.info('Collaboration service role can log in with the new password');
  } else if (process.argv.includes('--archive-audit')) {
    const policy = auditArchivePolicy(process.env);
    console.info(`Collaboration audit events archived: ${await archiveAudit(pool, policy)}`, policy);
  } else {
    const auth = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await auth.auth.admin.getUserById(required('ADMIN_INITIAL_USER_ID'));
    demand(
      !error && data.user?.email && data.user.email_confirmed_at,
      'forbidden',
      '初始管理员必须是认证提供方确认的已验证用户'
    );
    // 第一个数据模式版本：应用实体定义生成的清单文件（产品的清单在 rxdb-admin-template/schema/collaboration-schema.json）
    const schema = parseSchemaManifest(JSON.parse(await readFile(required('ADMIN_SCHEMA_FILE'), 'utf8')));
    console.info(
      await new CollaborationRepository(pool).initialize({
        teamId: required('ADMIN_TEAM_ID'),
        appId: required('ADMIN_APP_ID'),
        name: required('ADMIN_TEAM_NAME'),
        bootstrapKey: required('ADMIN_BOOTSTRAP_KEY'),
        admin: { id: data.user.id, email: data.user.email, verified: true },
        schema
      })
    );
  }
} finally {
  await pool.end();
}
