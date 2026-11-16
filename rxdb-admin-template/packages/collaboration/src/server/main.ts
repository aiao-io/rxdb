import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { demand } from '../model.js';
import { assertPublicKey } from './config.js';
import { collaborationServer } from './http.js';
import { CollaborationRepository } from './repository.js';
const required = (name: string) => {
  const value = process.env[name];
  demand(value, 'configuration', `缺少环境变量 ${name}`);
  return value;
};
const supabaseUrl = required('SUPABASE_URL');
const supabaseKey = required('SUPABASE_ANON_KEY');
assertPublicKey(supabaseKey);
const auth = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const pool = new pg.Pool({ connectionString: required('ADMIN_DATABASE_URL'), max: 10, statement_timeout: 30000 });
const server = collaborationServer({
  repository: new CollaborationRepository(pool),
  origins: required('ADMIN_ALLOWED_ORIGINS')
    .split(',')
    .map(value => value.trim()),
  publicConfig: { supabaseUrl, supabaseKey },
  authenticate: async token => {
    const { data, error } = await auth.auth.getUser(token);
    demand(!error && data.user?.email && data.user.email_confirmed_at, 'unauthenticated', '会话已失效，请重新登录');
    return { id: data.user.id, email: data.user.email, verified: true };
  }
});
server.listen(Number(process.env['ADMIN_API_PORT'] ?? 8088), process.env['ADMIN_API_HOST'] ?? '127.0.0.1', () =>
  console.info('Collaboration API ready')
);
const stop = () =>
  server.close(() => {
    void pool.end();
  });
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
