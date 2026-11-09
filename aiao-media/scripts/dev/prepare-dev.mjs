import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSupabaseConfig } from '../../apps/web/scripts/build-supabase-config.mjs';
import { localEnvironment, workspaceRoot } from '../supabase/supabase-local.mjs';

export async function writeDevelopmentConfig(root, { publicEnv, env, url }) {
  const api = resolve(root, 'apps/api');
  const directory = resolve(api, '.wrangler/local-dev');
  const assets = resolve(directory, 'assets');
  const config = JSON.parse(await readFile(resolve(api, 'wrangler.json'), 'utf8'));
  config.assets = {
    ...config.assets,
    directory: assets,
    html_handling: 'auto-trailing-slash',
    not_found_handling: 'none'
  };
  delete config.$schema;
  config.main = resolve(api, config.main);
  await mkdir(assets, { recursive: true });
  await writeFile(
    resolve(assets, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>Aiao Media API</title>
<h1>Aiao Media API</h1>
<p><a href="/api/templates">查看公开模板</a></p>
<p><a href="http://localhost:4300">Web</a> · <a href="http://localhost:4302">Admin</a></p>
</html>
`
  );
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
  await writeDevelopmentConfig(workspaceRoot, local);
  console.log(
    '本地开发配置已准备：Web http://localhost:4300 · Admin http://localhost:4302 · API http://127.0.0.1:8787'
  );
  console.log(
    `Supabase Studio（数据库管理）: http://127.0.0.1:${local.env.STUDIO_PORT}\nSupabase API（无网页首页）: ${local.url}\n注册确认邮件（Inbucket）: ${local.mailUrl}`
  );
}
