import { randomBytes } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const placeholder = value => !value || /^(replace|your_|你的|<)/i.test(value);

/** 读取本地已有凭据，仅补齐 OAuth 所需配置，保留其他服务和有效的 cookie 密钥。 */
export async function configureSupabaseOAuthLocal(application = resolve(import.meta.dirname, '..'), env = process.env) {
  const varsPath = resolve(application, 'deploy/.dev.vars');
  let existing = '';
  try { existing = await readFile(varsPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const values = parseEnv(existing);
  const clientId = (env.SUPABASE_OAUTH_CLIENT_ID || values.SUPABASE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (env.SUPABASE_OAUTH_CLIENT_SECRET || values.SUPABASE_OAUTH_CLIENT_SECRET || '').trim();
  if (placeholder(clientId) || placeholder(clientSecret) || /[\r\n]/.test(clientId + clientSecret))
    throw new Error('请先在 deploy/.dev.vars 填入有效的 Client ID 和 Client Secret；密钥不会写入日志。');
  const sql = await readFile(resolve(application, 'tmp/supabase-autoinit.sql'));
  const text = sql.toString('utf8');
  if (!text.includes('\nBEGIN;\n') || !text.includes('\nCOMMIT;')) throw new Error('初始化 SQL 不完整，原配置未修改。');
  const oldCookie = env.SUPABASE_OAUTH_COOKIE_SECRET || values.SUPABASE_OAUTH_COOKIE_SECRET || '';
  const additions = {
    SUPABASE_OAUTH_CLIENT_ID: clientId,
    SUPABASE_OAUTH_CLIENT_SECRET: clientSecret,
    SUPABASE_OAUTH_COOKIE_SECRET: !placeholder(oldCookie) && oldCookie.length >= 32 ? oldCookie : randomBytes(32).toString('hex'),
    SUPABASE_OAUTH_REDIRECT_URI: 'http://localhost:4398/api/supabase/oauth/callback',
    MEDIA_SUPABASE_AUTOINIT_SQL_B64: sql.toString('base64')
  };
  const replaced = new Set([...Object.keys(additions), 'MEDIA_SUPABASE_AUTOINIT_SQL']);
  const kept = existing.split(/\r?\n/).filter(line => !replaced.has(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]));
  const updated = kept.join('\n').trimEnd() + '\n' + Object.entries(additions).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n';
  const temporary = `${varsPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, updated, { mode: 0o600, flag: 'wx' });
  await rename(temporary, varsPath);
  await chmod(varsPath, 0o600);
  return varsPath;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const path = await configureSupabaseOAuthLocal();
  console.log(`本地 OAuth 配置已补齐：${path}；保留其他变量，权限 0600。`);
  console.log('重启 aiao-media:preview 后生效；未输出任何密钥。');
  console.log('本地入口：http://localhost:4398/providers；Supabase OAuth 应用需登记 http://localhost:4398/api/supabase/oauth/callback。');
}
