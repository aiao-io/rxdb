import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const application = resolve(import.meta.dirname, '..');
const varsPath = resolve(application, 'deploy/.dev.vars');
const sqlPath = resolve(application, 'tmp/supabase-autoinit.sql');
const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret)
  throw new Error(
    '请在命令环境变量中提供 SUPABASE_OAUTH_CLIENT_ID 和 SUPABASE_OAUTH_CLIENT_SECRET；不要把 secret 写进 Git。'
  );
const sql = await readFile(sqlPath);
const values = [
  `SUPABASE_OAUTH_CLIENT_ID=${clientId}`,
  `SUPABASE_OAUTH_CLIENT_SECRET=${clientSecret}`,
  `SUPABASE_OAUTH_COOKIE_SECRET=${randomBytes(32).toString('hex')}`,
  'SUPABASE_OAUTH_REDIRECT_URI=http://127.0.0.1:4398/api/supabase/oauth/callback',
  `MEDIA_SUPABASE_AUTOINIT_SQL_B64=${sql.toString('base64')}`
];
await writeFile(varsPath, `${values.join('\n')}\n`, { mode: 0o600 });
await chmod(varsPath, 0o600);
console.log(`写入本地 Worker 配置：${varsPath}`);
console.log('请重启 aiao-media:preview；配置只写入 Git 忽略文件。');
