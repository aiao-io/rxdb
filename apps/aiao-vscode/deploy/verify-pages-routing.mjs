// 通过 pnpm nx run aiao-vscode:verify-pages-routing 运行（先做生产构建）。
// Cloudflare Pages 默认把 .html 308 到无扩展名地址（/a/index.html → /a/，/a/b.html → /a/b）。
// 工作台的 iframe 直接导航 browser-workbench-assets 下的 .html（Markdown 扩展宿主、VS Code webview 的
// index / fake 页）：Service Worker 接管导航时沿用 redirect: manual，拿到 opaqueredirect 判失败，iframe 变错误页；
// 浏览器自己跟随重定向时，无扩展名地址又会被 SW 当成应用路由回退成 index.html，iframe 里套出整个工作台。
// 这里用 wrangler pages dev（与线上同一套 Pages 静态资源服务）逐个确认这些地址原样 200 返回，
// 并确认资源目录不在 SW 的导航回退范围内。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const deployRoot = import.meta.dirname;
const site = resolve(deployRoot, '../dist/browser');
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

const port = await new Promise((resolvePort, reject) => {
  const probe = createServer()
    .once('error', reject)
    .listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
});
const origin = `http://127.0.0.1:${port}`;
const state = await mkdtemp(join(tmpdir(), 'aiao-vscode-pages-'));
// 在 deploy/ 下启动：读取 wrangler.toml 的 pages_build_output_dir，带上 Functions 与 _routes，路由与线上一致。
const server = spawn(
  'pnpm',
  ['dlx', wrangler, 'pages', 'dev', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state],
  {
    cwd: deployRoot,
    detached: true,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe']
  }
);
let log = '';
server.stdout.on('data', chunk => (log += chunk));
server.stderr.on('data', chunk => (log += chunk));
const exited = new Promise(resolveExit => server.once('exit', resolveExit));

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(`ok  ${name}`);
  } catch (cause) {
    results.push(`FAIL ${name}: ${cause.message}`);
  }
};

try {
  const deadline = Date.now() + 120_000;
  while (
    !(await fetch(`${origin}/`, { redirect: 'manual' }).then(
      response => response.ok,
      () => false
    ))
  ) {
    assert.equal(server.exitCode, null, `wrangler pages dev 提前退出：\n${log}`);
    assert.ok(Date.now() < deadline, `wrangler pages dev 启动超时：\n${log}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }

  for (const path of pages) {
    await check(`${path} 原样 200 返回`, async () => {
      const response = await fetch(`${origin}${path}?id=verify`, { redirect: 'manual' });
      const location = response.headers.get('location');
      assert.equal(response.status, 200, `返回 ${response.status}${location ? ` → ${location}` : ''}`);
      assert.ok(
        Buffer.from(await response.arrayBuffer()).equals(await readFile(join(site, path))),
        '响应内容不是该文件'
      );
      assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
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
  if (server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
  await exited;
  await rm(state, { recursive: true, force: true });
}

console.log(results.join('\n'));
if (results.some(line => line.startsWith('FAIL'))) process.exit(1);
console.log(`\n${results.length} checks passed`);
