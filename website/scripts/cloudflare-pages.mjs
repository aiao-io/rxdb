import { appendFile, copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectName = 'rxdb';
const domainName = 'rxdb.aiao.io';
const maxAssetBytes = 25 * 1024 * 1024;

async function request(credentials, suffix, { method = 'GET', body, allowMissing = false } = {}) {
  const { accountId, apiToken } = credentials;
  if (!accountId || !apiToken) throw new Error('缺少 CLOUDFLARE_ACCOUNT_ID 或 CLOUDFLARE_API_TOKEN');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects${suffix}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  if (allowMissing && response.status === 404) return null;
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`Cloudflare HTTP ${response.status}: ${JSON.stringify(payload.errors)}`);
  }
  return payload.result;
}

export async function ensureProject(credentials) {
  let project = await request(credentials, `/${projectName}`, { allowMissing: true });
  if (project === null) {
    project = await request(credentials, '', {
      method: 'POST',
      body: { name: projectName, production_branch: 'main' }
    });
  }
  if (project.production_branch !== 'main') {
    throw new Error('Pages production_branch 必须为 main；请先在 Cloudflare 中修正项目配置');
  }
  return project;
}

export async function bindDomain(credentials) {
  const base = `/${projectName}/domains`;
  const domain = await request(credentials, `${base}/${domainName}`, { allowMissing: true });
  if (domain !== null) return domain;
  return request(credentials, base, { method: 'POST', body: { name: domainName } });
}

export async function prepareAssets(root) {
  const rules = [];
  for (const framework of ['angular', 'react', 'vue']) {
    const demoRoot = path.join(root, 'demo', framework);
    await copyFile(path.join(demoRoot, 'index.html'), path.join(root, 'demo', `${framework}.html`));
    const entries = await readdir(demoRoot, { recursive: true, withFileTypes: true });
    const assets = entries.filter(entry => entry.isFile() && entry.name !== 'index.html');
    rules.push(
      ...assets.map(entry => {
        const url = '/' + path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
        return `${url} ${url} 200`;
      })
    );
  }
  if (rules.length > 2000) throw new Error(`Pages 最多 2000 条静态路由，demo 资源需要 ${rules.length} 条`);
  const redirects = await readFile(new URL('../public/_redirects', import.meta.url), 'utf8');
  await writeFile(path.join(root, '_redirects'), [...rules.sort(), redirects].join('\n'));
}

export async function checkAssets(root) {
  const required = [
    'index.html',
    '404.html',
    '_headers',
    '_redirects',
    'demo/angular/index.html',
    'demo/react/index.html',
    'demo/vue/index.html',
    'demo/angular.html',
    'demo/react.html',
    'demo/vue.html',
    'benchmarks-app/index.html'
  ];
  for (const file of required) await stat(path.join(root, file));
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile());
  if (files.length > 20_000) throw new Error(`Pages 免费计划最多 20000 个文件，当前 ${files.length}`);
  let largest = 0;
  for (const entry of files) {
    const file = path.join(entry.parentPath, entry.name);
    const { size } = await stat(file);
    if (size > maxAssetBytes) throw new Error(`${path.relative(root, file)} 超过 Pages 25 MiB 限制`);
    largest = Math.max(largest, size);
  }
  return { files: files.length, largest };
}

async function main() {
  const operation = process.argv[2];
  const credentials = { accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN };
  if (operation === 'check-assets') {
    const result = await checkAssets(fileURLToPath(new URL('../build', import.meta.url)));
    console.log(`Pages 产物检查通过：${result.files} 个文件，最大文件 ${result.largest} 字节`);
    return;
  }
  if (operation === 'ensure-project') {
    const project = await ensureProject(credentials);
    console.log(`Pages 项目：${project.name}，生产分支：${project.production_branch}，DNS 目标：${project.subdomain}`);
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `subdomain=${project.subdomain}\n`);
    return;
  }
  if (operation === 'bind-domain') {
    const domain = await bindDomain(credentials);
    console.log(`Pages 域名：${domain.name}，状态：${domain.status}；DNS 和证书均生效后才可访问`);
    return;
  }
  throw new Error(`未知操作：${operation}`);
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
