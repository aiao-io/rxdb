import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { demand } from '../model.js';
import { parseSchemaManifest } from '../schema.js';
import { applyMigrations } from './migrate.js';
import { CollaborationRepository } from './repository.js';
const required = (name: string) => {
  const value = process.env[name];
  demand(value, 'configuration', `缺少环境变量 ${name}`);
  return value;
};
const pool = new pg.Pool({ connectionString: required('ADMIN_DATABASE_URL'), max: 1 });
try {
  if (process.argv.includes('--migrate')) {
    console.info('Collaboration migrations applied:', (await applyMigrations(pool)).join(', '));
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
