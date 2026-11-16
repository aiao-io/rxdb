import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { demand } from '../model.js';
import { CollaborationRepository } from './repository.js';
const required = (name: string) => {
  const value = process.env[name];
  demand(value, 'configuration', `缺少环境变量 ${name}`);
  return value;
};
const pool = new pg.Pool({ connectionString: required('ADMIN_DATABASE_URL'), max: 1 });
try {
  if (process.argv.includes('--migrate')) {
    await pool.query(
      await readFile(
        new URL('../../../../../supabase/migrations/202611160001_collaboration.sql', import.meta.url),
        'utf8'
      )
    );
    console.info('Collaboration migration applied');
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
    console.info(
      await new CollaborationRepository(pool).initialize({
        teamId: required('ADMIN_TEAM_ID'),
        appId: required('ADMIN_APP_ID'),
        name: required('ADMIN_TEAM_NAME'),
        bootstrapKey: required('ADMIN_BOOTSTRAP_KEY'),
        admin: { id: data.user.id, email: data.user.email, verified: true }
      })
    );
  }
} finally {
  await pool.end();
}
