// 通过 pnpm nx run aiao-vscode:verify-pages-routing 运行（先做生产构建，连带构建运行时宿主）。
// Cloudflare Pages 默认把 .html 308 到无扩展名地址（/a/index.html → /a/，/a/b.html → /a/b）。
// 工作台的 iframe 直接导航 browser-workbench-assets 下的 .html（Markdown 扩展宿主、VS Code webview 的
// index / fake 页）：Service Worker 接管导航时沿用 redirect: manual，拿到 opaqueredirect 判失败，iframe 变错误页；
// 浏览器自己跟随重定向时，无扩展名地址又会被 SW 当成应用路由回退成 index.html，iframe 里套出整个工作台。
// 这里用 wrangler pages dev（与线上同一套 Pages 静态资源服务）逐个确认这些地址原样 200 返回，
// 并确认资源目录不在 SW 的导航回退范围内。
// vivari 运行时宿主（独立的 Pages 项目，见 README）同样检查：宿主页与预览容器页原样 200，
// 响应头与本地宿主服务同一组，只有带内容哈希的 /assets/ 长缓存。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { RUNTIME_HOSTS } from '../src/runtime-hosts/hosts.ts';
import { deployedRuntimeHost, runtimeHostHeaders } from '../src/workbench/terminal/runtime-host-pages.ts';

const deployRoot = import.meta.dirname;
const site = resolve(deployRoot, '../dist/browser');
const hostSite = resolve(deployRoot, '../runtime-hosts/dist/vivari');
const wrangler = 'wrangler@4.158.0';

const walk = async directory =>
  (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map(entry =>
        entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]
      )
    )
  ).flat();
const pages = (await walk(join(site, 'browser-workbench-assets')))
  .filter(path => path.endsWith('.html'))
  .map(path => `/${relative(site, path).split(sep).join('/')}`);
assert.ok(
  pages.includes('/browser-workbench-assets/extension-host/index.html'),
  '缺少扩展宿主页，先运行 pnpm nx build aiao-vscode'
);
const host = deployedRuntimeHost(RUNTIME_HOSTS.vivari);
assert.ok(host, 'src/runtime-hosts/hosts.ts 里没有 vivari 的线上宿主源');
const hostHeaders = runtimeHostHeaders(host.parents);
const hostPages = (await readdir(hostSite)).filter(name => name.endsWith('.html')).map(name => `/${name}`);
assert.deepEqual(
  hostPages.toSorted(),
  ['/preview-frame.html', '/runtime-host.html'],
  '缺少 vivari 宿主页，先运行 pnpm nx run aiao-vscode:runtime-hosts'
);
const [hostAsset] = await readdir(join(hostSite, 'assets'));
/** 宿主页引用的入口脚本。 */
const hostScripts = (
  await Promise.all(hostPages.map(async page => [...(await readFile(join(hostSite, page), 'utf8')).matchAll(/src="([^"]+\.js)"/g)]))
)
  .flat()
  .map(([, src]) => src);

const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer()
      .once('error', reject)
      .listen(0, '127.0.0.1', () => {
        const { port } = probe.address();
        probe.close(() => resolvePort(port));
      });
  });

/**
 * 起 wrangler pages dev 并等 readyPath 返回 200。不给目录时在 deploy/ 下启动，读取 wrangler.toml 的
 * pages_build_output_dir，带上 Functions 与 _routes，路由与线上一致；给目录时只托管它的静态文件，
 * 在空的状态目录里启动，避开 deploy/wrangler.toml。
 */
async function pagesDev(directory, readyPath) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const state = await mkdtemp(join(tmpdir(), 'aiao-vscode-pages-'));
  const args = ['dlx', wrangler, 'pages', 'dev', ...(directory ? [directory] : [])];
  const server = spawn('pnpm', [...args, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state], {
    cwd: directory ? state : deployRoot,
    detached: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', chunk => (log += chunk));
  server.stderr.on('data', chunk => (log += chunk));
  const exited = new Promise(resolveExit => server.once('exit', resolveExit));
  const stop = async () => {
    if (server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
    await exited;
    await rm(state, { recursive: true, force: true });
  };
  const deadline = Date.now() + 120_000;
  const ready = () =>
    fetch(`${origin}${readyPath}`, { redirect: 'manual' }).then(
      response => response.ok,
      () => false
    );
  try {
    while (!(await ready())) {
      assert.equal(server.exitCode, null, `wrangler pages dev 提前退出：\n${log}`);
      assert.ok(Date.now() < deadline, `wrangler pages dev 启动超时：\n${log}`);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
    }
  } catch (cause) {
    await stop();
    throw cause;
  }
  return { origin, stop };
}

/** 地址原样 200 返回 root 下的同名文件，返回响应头。 */
async function servesFile(origin, root, path) {
  const response = await fetch(`${origin}${path}?id=verify`, { redirect: 'manual' });
  const location = response.headers.get('location');
  assert.equal(response.status, 200, `返回 ${response.status}${location ? ` → ${location}` : ''}`);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(await readFile(join(root, path))), '响应内容不是该文件');
  return response.headers;
}

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`ok  ${name}`);
  } catch (cause) {
    results.push(`FAIL ${name}: ${cause.message}`);
  }
};

const workbench = await pagesDev(undefined, '/');
try {
  for (const path of pages) {
    await check(`${path} 原样 200 返回`, async () => {
      const headers = await servesFile(workbench.origin, site, path);
      assert.equal(headers.get('cross-origin-embedder-policy'), 'require-corp');
    });
  }

  await check('资源目录不在 Service Worker 的导航回退范围', async () => {
    const { navigationUrls } = JSON.parse(await readFile(join(site, 'ngsw.json'), 'utf8'));
    const matches = positive =>
      navigationUrls.filter(entry => entry.positive === positive).map(entry => new RegExp(entry.regex));
    const [include, exclude] = [matches(true), matches(false)];
    const navigates = url => include.some(regex => regex.test(url)) && !exclude.some(regex => regex.test(url));
    const extensionless = pages.map(path => path.replace(/\/index\.html$/, '/').replace(/\.html$/, ''));
    assert.deepEqual(extensionless.filter(navigates), [], '这些地址会被回退成应用外壳');
  });
} finally {
  await workbench.stop();
}

// 就绪探测用不受改写规则影响的文件：规则失效时由下面的检查报出 308，而不是在这里等到超时
const vivari = await pagesDev(hostSite, '/sw.js');
/** 宿主产物的文件原样返回、带全套宿主响应头；只有带内容哈希的 /assets/ 长缓存。 */
const checkHostFile = path =>
  check(`vivari 宿主 ${path} 原样 200 返回，带宿主响应头`, async () => {
    const headers = await servesFile(vivari.origin, hostSite, path);
    for (const [name, value] of Object.entries(hostHeaders)) assert.equal(headers.get(name), value, name);
    const cache = headers.get('cache-control') ?? '';
    assert.equal(cache.includes('immutable'), path.startsWith('/assets/'), `Cache-Control: ${cache}`);
  });
try {
  for (const path of [...hostPages, ...hostScripts, '/sw.js', `/assets/${hostAsset}`, '/vendor/npm-pack.bin'])
    await checkHostFile(path);
  // 宿主页本身不缓存，入口脚本地址固定的话，zone 的浏览器缓存 TTL（aiao.io 为 4 小时）会让重新部署后仍跑旧脚本
  await check('vivari 宿主页引用的入口脚本带内容哈希', () => {
    assert.equal(hostScripts.length, hostPages.length, `入口脚本：${hostScripts.join('、')}`);
    for (const src of hostScripts) assert.match(src, /^\/[a-z-]+-[A-Z0-9]{8}\.js$/);
  });
} finally {
  await vivari.stop();
}

console.log(results.join('\n'));
if (results.some(line => line.startsWith('FAIL'))) process.exit(1);
console.log(`\n${results.length} checks passed`);
