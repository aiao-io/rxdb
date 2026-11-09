import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSupabaseConfig } from '../../apps/web/scripts/build-supabase-config.mjs';
import { localEnvironment, workspaceRoot } from '../supabase/supabase-local.mjs';
import { developmentAccounts, seedDevelopmentAccounts } from './seed-accounts.mjs';

async function developmentDashboard({ env, url, mailUrl }) {
  const [user, admin] = developmentAccounts;
  const values = {
    API_URL: url,
    STUDIO_URL: `http://127.0.0.1:${env.STUDIO_PORT}`,
    MAIL_URL: mailUrl,
    DB_PORT: env.DB_PORT,
    DB_PASSWORD: env.POSTGRES_PASSWORD,
    DB_URI: `postgresql://postgres:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:${env.DB_PORT}/postgres`,
    USER_EMAIL: user.email,
    USER_PASSWORD: user.password,
    ADMIN_EMAIL: admin.email,
    ADMIN_PASSWORD: admin.password
  };
  const html = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) =>
    String(values[name]).replace(/[&<>"']/g, char => entities[char])
  );
}

export async function writeDevelopmentConfig(root, local) {
  const { publicEnv, env, url } = local;
  const api = resolve(root, 'apps/api');
  const directory = resolve(api, '.wrangler/local-dev');
  const assets = resolve(directory, 'assets');
  const config = JSON.parse(await readFile(resolve(api, 'wrangler.json'), 'utf8'));
  config.durable_objects.bindings = config.durable_objects.bindings.filter(
    binding => binding.name !== 'MEDIA_INSTALLATION'
  );
  config.assets = {
    ...config.assets,
    directory: assets,
    html_handling: 'auto-trailing-slash',
    not_found_handling: 'none'
  };
  delete config.$schema;
  config.main = resolve(api, config.main);
  await mkdir(assets, { recursive: true });
  const homepage = resolve(assets, 'index.html');
  await writeFile(homepage, await developmentDashboard(local), { mode: 0o600 });
  await chmod(homepage, 0o600);
  await writeFile(resolve(assets, '_headers'), '/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n');
  await writeFile(resolve(directory, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n');
  const secrets = resolve(directory, '.dev.vars');
  await writeFile(
    secrets,
    Object.entries({
      MEDIA_SUPABASE_URL: url,
      MEDIA_SUPABASE_ANON_KEY: env.ANON_KEY,
      MEDIA_SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY
    })
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join('\n') + '\n',
    { mode: 0o600 }
  );
  await chmod(secrets, 0o600);
  await buildSupabaseConfig(publicEnv, resolve(root, 'apps/web/public/app-config.js'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const local = await localEnvironment();
  await seedDevelopmentAccounts(local);
  await writeDevelopmentConfig(workspaceRoot, local);
  console.log(
    '本地开发配置已准备：Web http://localhost:4300 · Admin http://localhost:4302 · API http://127.0.0.1:8787'
  );
  console.log(
    `Supabase Studio（数据库管理）: http://127.0.0.1:${local.env.STUDIO_PORT}\nSupabase API（无网页首页）: ${local.url}\n注册确认邮件（Inbucket）: ${local.mailUrl}`
  );
}
