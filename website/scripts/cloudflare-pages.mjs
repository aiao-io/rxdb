import { appendFile, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectName = 'rxdb';
const domainName = 'rxdb.aiao.io';
const maxAssetBytes = 25 * 1024 * 1024;
const deploymentPageSize = 25;

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
    throw new Error(`Cloudflare HTTP ${response.status}: ${JSON.stringify(payload.errors)}`, {
      cause: { status: response.status, errors: payload.errors }
    });
  }
  return payload;
}

/** 创建或复用以 main 为生产分支的项目，返回经过校验的 Pages 子域。 */
export async function ensureProject(credentials) {
  let payload = await request(credentials, `/${projectName}`, { allowMissing: true });
  if (payload === null) payload = await createProject(credentials);
  const project = payload.result;
  if (project.production_branch !== 'main') {
    throw new Error('Pages production_branch 必须为 main；请先在 Cloudflare 中修正项目配置');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.pages\.dev$/.test(project.subdomain)) {
    throw new Error('Pages subdomain 必须是有效的 pages.dev 子域');
  }
  return project;
}

async function createProject(credentials) {
  try {
    return await request(credentials, '', {
      method: 'POST',
      body: { name: projectName, production_branch: 'main' }
    });
  } catch (error) {
    const { status, errors } = error.cause ?? {};
    const conflict = status === 409 || (status === 400 && errors?.some(item => item.code === 8000002));
    if (!conflict) throw error;
    return request(credentials, `/${projectName}`);
  }
}

/** 关联正式域名并返回验证状态；DNS 与证书仍需 Cloudflare 验证。 */
export async function bindDomain(credentials) {
  const base = `/${projectName}/domains`;
  const payload = await request(credentials, `${base}/${domainName}`, { allowMissing: true });
  if (payload !== null) return payload.result;
  return (await request(credentials, base, { method: 'POST', body: { name: domainName } })).result;
}

async function previewDeployments(credentials, branch) {
  const deployments = [];
  for (let page = 1; ; page++) {
    const payload = await request(
      credentials,
      `/${projectName}/deployments?env=preview&per_page=${deploymentPageSize}&page=${page}`
    );
    deployments.push(...payload.result);
    const lastPage = payload.result_info?.total_pages;
    if (lastPage ? page >= lastPage : payload.result.length < deploymentPageSize) break;
  }
  return deployments.filter(
    item => item.environment === 'preview' && item.deployment_trigger?.metadata?.branch === branch
  );
}

/** 清理指定 PR 的旧部署；关闭时保留关闭提示页，正常发布时另保留上一次成功部署。 */
export async function cleanPreviewDeployments(credentials, { branch, keepUrl, keepPrevious = true }) {
  if (!/^pr-[1-9][0-9]*$/.test(branch)) throw new Error('只允许清理 pr-<正整数> 分支');
  if (!keepUrl) throw new Error('必须指定要保留的本次成功部署 URL');
  const deployments = await previewDeployments(credentials, branch);
  const current = deployments.find(item => item.url === keepUrl && item.latest_stage?.status === 'success');
  if (!current) throw new Error('找不到本次成功部署，停止清理');
  const keep = new Set([current.id]);
  if (keepPrevious) {
    const previous = deployments
      .filter(item => item.id !== current.id && item.latest_stage?.status === 'success')
      .sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
    if (previous) keep.add(previous.id);
  }
  const obsolete = [...new Set(deployments.filter(item => !keep.has(item.id)).map(item => item.id))];
  if (obsolete.some(id => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)))
    throw new Error('Pages 返回无效的 deployment id，停止清理');
  for (const id of obsolete) {
    await request(credentials, `/${projectName}/deployments/${id}?force=true`, {
      method: 'DELETE',
      allowMissing: true
    });
  }
  return obsolete;
}

/** 创建无应用资源的关闭提示页，Pages 对未匹配路径返回该自定义 404。 */
export async function createClosedPreview(root, number) {
  if (!/^[1-9][0-9]*$/.test(number)) throw new Error('PR 编号必须为正整数');
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, '404.html'),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>预览已关闭</title><h1>PR #${number} 预览已关闭</h1><p>这个 PR 已关闭或合并，旧预览内容已下线。重新打开 PR 后会重新构建。</p><p><a href="https://github.com/aiao-io/rxdb/pull/${number}">返回 PR</a></p></html>`
  );
  await writeFile(path.join(root, '_headers'), '/*\n  X-Robots-Tag: noindex\n  Cache-Control: no-store\n');
}

/** 生成三端 SPA 入口与静态资源规则；超过 Pages 静态规则配额时抛错。 */
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

/** 校验入口、文件数量和大小，返回文件数与最大文件字节数。 */
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
  if (operation === 'close-preview') {
    await createClosedPreview(
      fileURLToPath(new URL('../../.nx/website-preview-closed', import.meta.url)),
      process.env.PR_NUMBER
    );
    return;
  }
  if (operation === 'clean-preview') {
    const deleted = await cleanPreviewDeployments(credentials, {
      branch: process.env.DEPLOYMENT_BRANCH,
      keepUrl: process.env.KEEP_DEPLOYMENT_URL,
      keepPrevious: process.env.KEEP_PREVIOUS_DEPLOYMENT !== 'false'
    });
    console.log(`已清理 ${deleted.length} 个 PR 预览部署`);
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
