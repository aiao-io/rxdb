/**
 * 本地预演栈上的发布动作（ADMIN-US-217 AC#2 / AC#8）：发布流水线（`deploy-local.mjs`）与回滚（`rollback-local.mjs`）共用——
 * 让某个发布的函数上线、读函数的健康检查、核对静态站点送出的页面、发布前的健康检查、迁移清单与 git 状态。
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { frameworks, local, migrationsRoot, releasesRoot, siteRoot } from './paths.mjs';
import { compose, request, run, waitFor } from './process.mjs';
import { pointLink, pointToRelease } from './releases.mjs';

/**
 * 当前提交、产品目录是否有未提交的改动，以及平台包（`packages/`）里未提交改动的文件（只读的 git 命令）。
 * 产物把平台包的 dist 打了进去，平台包有未提交改动时，发布清单据此说明这一版不是由某个提交单独决定的。
 */
export async function gitState() {
  const commit = (await run('git', ['rev-parse', 'HEAD'], { capture: true })).trim();
  const changes = await run('git', ['status', '--porcelain', '--', 'rxdb-admin-template'], { capture: true });
  const platform = await run('git', ['status', '--porcelain', '--', 'packages'], { capture: true });
  return {
    commit,
    dirty: changes.trim().length > 0,
    platformChanges: platform
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(3))
  };
}

/** 迁移文件的清单：文件名与 sha256，记进发布清单，回滚时据此判断哪些迁移比目标发布新。 */
export async function migrationManifest() {
  const names = (await readdir(migrationsRoot)).filter(name => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async name => ({
      name,
      sha256: createHash('sha256')
        .update(await readFile(path.join(migrationsRoot, name)))
        .digest('hex')
    }))
  );
}

/** 读函数经网关的健康检查（可能是 200 或 503；函数没起来时是平台的错误 JSON）。 */
export async function functionHealth() {
  const response = await request(`${local.functionUrl}/health`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

/**
 * 让某个发布的函数上线：函数链接指向它（`null` 表示空函数目录），以它的发布 ID 重建函数容器，等健康检查报出这个 ID。
 * 生产对应 `supabase functions deploy`（加上 `supabase secrets set ADMIN_RELEASE=<发布 ID>`）。
 */
export async function activateFunction(secrets, id) {
  if (id) await pointToRelease(siteRoot, 'functions', id);
  else await pointLink(siteRoot, 'functions', 'empty/functions');
  const release = id ?? 'none';
  await compose(['up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '90', 'functions'], {
    secrets,
    release
  });
  if (!id) return;
  await waitFor(
    `函数上线（${id}）`,
    async () => {
      const { body } = await functionHealth();
      return body?.release === id;
    },
    { timeoutMs: 90_000, intervalMs: 1000 }
  );
}

/** 一个页面引用的第一个脚本（相对路径）。 */
function firstScript(html) {
  return /<script[^>]+src="([^"]+)"/.exec(html)?.[1];
}

/** 核对某个地址送出的首页就是某个发布目录里的那一份（逐字节相同）。 */
export async function servesRelease(base, file) {
  const response = await request(`${base}/`);
  return response.ok && (await response.text()) === (await readFile(file, 'utf8'));
}

/**
 * 第 7 步的健康检查：函数、Supabase 各服务与三端预览，全部通过才算健康。返回各项结果（写进发布记录）。
 * @param {Record<string, string>} secrets
 * @param {string} id
 */
export async function healthChecks(secrets, id) {
  const checks = {};
  const fn = await functionHealth();
  if (fn.status !== 200 || fn.body?.status !== 'ok' || fn.body?.release !== id)
    throw new Error(`函数健康检查未通过：${fn.status} ${JSON.stringify(fn.body)}`);
  checks.function = fn.body;
  const apikey = { apikey: secrets.ANON_KEY, authorization: `Bearer ${secrets.ANON_KEY}` };
  for (const [name, url] of [
    ['auth', `${local.supabaseUrl}/auth/v1/health`],
    ['rest', `${local.supabaseUrl}/rest/v1/`],
    ['realtime', `${local.supabaseUrl}/realtime/v1/api/tenants/realtime-dev/health`]
  ]) {
    const response = await request(url, { headers: apikey });
    if (!response.ok) throw new Error(`${name} 健康检查未通过：${response.status}`);
    checks[name] = response.status;
  }
  for (const framework of frameworks) {
    const base = local.staged[framework];
    const index = path.join(releasesRoot, id, 'web', framework, 'index.html');
    if (!(await servesRelease(base, index))) throw new Error(`${framework} 预览送出的首页不是本次发布的`);
    const html = await readFile(index, 'utf8');
    const route = await request(`${base}/collaboration`);
    if (!route.ok || !(route.headers.get('content-type') ?? '').includes('text/html'))
      throw new Error(`${framework} 预览的前端路由 /collaboration 不可用：${route.status}`);
    const script = firstScript(html);
    if (!script) throw new Error(`${framework} 首页没有脚本`);
    const asset = await request(new URL(script, `${base}/`).href);
    if (!asset.ok || !(asset.headers.get('content-type') ?? '').includes('javascript'))
      throw new Error(`${framework} 预览的脚本不可用：${asset.status} ${asset.headers.get('content-type')}`);
    const config = await (await request(`${base}/collaboration-api/config`)).json();
    if (config.supabaseUrl !== local.supabaseUrl || config.supabaseKey !== secrets.ANON_KEY)
      throw new Error(`${framework} 预览经 /collaboration-api/config 取到的公开配置不对`);
    const health = await (await request(`${base}/collaboration-api/health`)).json();
    if (health.release !== id || health.status !== 'ok')
      throw new Error(`${framework} 预览经改写访问的函数不是本次发布：${health.release}`);
    checks[framework] = { index: 'ok', route: 'ok', script, config: 'ok', rewrite: 'ok' };
  }
  return checks;
}
