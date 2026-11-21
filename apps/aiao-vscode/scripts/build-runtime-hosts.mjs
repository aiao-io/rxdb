// 构建运行时宿主页（US-409），每种运行时一个目录，各自部署在独占的源上：
// - vivari：内核宿主页、预览容器页、Worker 资源与包管理器 vendor 包（内核 Worker、预览 Service Worker 与 vendor 包都从源根取）；
// - nodepod：宿主页、预览 Service Worker 与进程 Worker（MIT + Commons Clause，仅内部评估）。
// 用法：node scripts/build-runtime-hosts.mjs [输出目录]，默认 runtime-hosts/dist。
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { RUNTIME_HOSTS } from '../src/runtime-hosts/hosts.ts';
import { deployedRuntimeHost, pagesHeaders, pagesRedirects } from '../src/workbench/terminal/runtime-host-pages.ts';
import { patchPreviewServiceWorker } from '../src/workbench/terminal/vivari-service-worker.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const resolver = createRequire(join(packageRoot, 'package.json'));
const outputRoot = resolve(process.argv[2] ?? join(packageRoot, 'runtime-hosts/dist'));
const cache = join(packageRoot, 'node_modules/.cache/runtime-hosts');

/** vendor 包与 @vivari/core 版本绑定：内核按这个版本的格式解包。 */
const VIVARI_VERSION = '1.2.1';
const VENDOR_BASE = 'https://vivari.run/studio/vendor/';
/**
 * vivari 运行包管理器时按 `/vendor/<name>` 取的打包件；npm 包里不带，来自 vivari.run，按 SHA-256 钉死。
 * tsgo-pack.bin 只在运行 tsgo 时才取，内置模板用不到，不下载。
 */
const VENDOR_PACKS = [
  {
    name: 'corepack-pack.bin',
    bytes: 122642,
    sha256: '648210d905862538b4e8eb754c29a7a1eaceeb9cd6e255957be4ace67f90ba2a'
  },
  { name: 'npm-pack.bin', bytes: 2786927, sha256: '9cc4fdc47b130b415b2587fce0e9e24980f56fc406b510af3ba9dbcc6e72b5e0' },
  { name: 'pnpm-pack.bin', bytes: 4824787, sha256: 'bd371d4c3fead4583a34dc58805c534be0cf1f57d48ae42d96b592c804ed693c' },
  { name: 'yarn-pack.bin', bytes: 1241130, sha256: 'c435041efe63f173ef6fd80d0fcb707638cd2b8e20dca25b96d22527b7a42bb5' }
];

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** 本地缓存里的 vendor 包；缓存只认钉死的哈希，内容不符就当作没有。 */
async function cachedPack(pack) {
  try {
    const bytes = await readFile(join(cache, `${pack.sha256}.bin`));
    return digest(bytes) === pack.sha256 ? bytes : undefined;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function downloadPack(pack) {
  const url = new URL(pack.name, VENDOR_BASE);
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`下载 ${url} 失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = digest(bytes);
  if (actual !== pack.sha256)
    throw new Error(
      `${url} 的 SHA-256 与钉死的值不符（${actual}，${bytes.length} 字节）；vivari.run 更新了打包件，需要重新核对`
    );
  await mkdir(cache, { recursive: true });
  await writeFile(join(cache, `${pack.sha256}.bin`), bytes);
  return bytes;
}

const page = (title, script) => `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>html, body { margin: 0; height: 100%; }</style>
  </head>
  <body>
    <script type="module" src="/${script}"></script>
  </body>
</html>
`;

const bundle = (entryPoints, outdir, options = {}) =>
  build({
    ...options,
    entryPoints,
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    legalComments: 'external',
    logLevel: 'warning'
  });
/**
 * 打包宿主页的入口，返回入口名 → 带内容哈希的产物文件名。宿主页本身每次重新验证，入口脚本地址随内容变：
 * 地址固定的话，自定义域名上 zone 的浏览器缓存 TTL 会让重新部署后的浏览器继续跑旧脚本。
 */
async function bundleEntries(entryPoints, outdir, options = {}) {
  const { metafile } = await bundle(entryPoints, outdir, { ...options, entryNames: '[name]-[hash]', metafile: true });
  const scripts = {};
  for (const [file, { entryPoint }] of Object.entries(metafile.outputs)) {
    const name = Object.keys(entryPoints).find(entry => entryPoint && resolve(entryPoint) === entryPoints[entry]);
    if (name) scripts[name] = basename(file);
  }
  const missing = Object.keys(entryPoints).filter(entry => !scripts[entry]);
  if (missing.length > 0) throw new Error(`esbuild 产物里找不到入口：${missing.join('、')}`);
  return scripts;
}
/**
 * 部署配置里有线上宿主源的运行时，在产物里写 Cloudflare Pages 的 `_headers` / `_redirects`：
 * 响应头与本地静态服务同一组，iframe 直接导航的页面原样返回。本地静态服务不读这两个文件。
 */
async function writePagesConfig(output, table, pages) {
  const deployed = deployedRuntimeHost(table);
  if (!deployed) return;
  await writeFile(join(output, '_headers'), pagesHeaders(deployed.parents));
  await writeFile(join(output, '_redirects'), pagesRedirects(pages));
}

/** 包根与清单；有的包（Nodepod）的 exports 不暴露 package.json，从入口往上找。 */
const packageOf = async name => {
  let root = dirname(resolver.resolve(name));
  while (!existsSync(join(root, 'package.json'))) root = dirname(root);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.name !== name) throw new Error(`${name} 的包根定位错了：${root}`);
  return { root, manifest };
};

await rm(outputRoot, { recursive: true, force: true });

const { root: vivariRoot, manifest: vivari } = await packageOf('@vivari/core');
if (vivari.version !== VIVARI_VERSION)
  throw new Error(
    `@vivari/core 已是 ${vivari.version}，vendor 包按 ${VIVARI_VERSION} 钉死：先核对新版本的打包件再改哈希`
  );
const output = join(outputRoot, 'vivari');
await mkdir(join(output, 'assets'), { recursive: true });
await mkdir(join(output, 'vendor'), { recursive: true });
const vivariScripts = await bundleEntries(
  {
    host: join(packageRoot, 'src/runtime-hosts/vivari/host.ts'),
    'preview-frame': join(packageRoot, 'src/runtime-hosts/vivari/preview-frame.ts')
  },
  output
);
// 宿主页路径与 runtime-host-frame.ts 的 RUNTIME_HOST_PAGE 一致
await writeFile(join(output, 'runtime-host.html'), page('vivari 运行时宿主', vivariScripts.host));
await writeFile(join(output, 'preview-frame.html'), page('项目服务预览', vivariScripts['preview-frame']));
// 内核 Worker 写死从源根的 /assets/ 加载其余 Worker；预览 Service Worker 注册在源根，
// 并去掉它放行 `/@fs/` 的一条规则（原因与升级时的核对见 vivari-service-worker.ts）
const assets = join(vivariRoot, 'dist/assets');
for (const name of await readdir(assets)) {
  if (name === 'sw.js') {
    const source = await readFile(join(assets, name), 'utf8');
    await writeFile(join(output, 'sw.js'), patchPreviewServiceWorker(source));
  } else {
    await copyFile(join(assets, name), join(output, 'assets', name));
  }
}
for (const pack of VENDOR_PACKS) {
  const bytes = (await cachedPack(pack)) ?? (await downloadPack(pack));
  await writeFile(join(output, 'vendor', pack.name), bytes);
}
// 内核每次安装都会查预构建依赖快照与模板锁文件的清单（按 id 查表）；我们不提供，给空表而不是 404
for (const manifest of ['depcache', 'locks']) {
  await mkdir(join(output, 'vendor', manifest), { recursive: true });
  await writeFile(join(output, 'vendor', manifest, 'index.json'), '{}\n');
}
await writeFile(
  join(output, 'NOTICE.txt'),
  [
    `@vivari/core ${vivari.version}（${vivari.license}）：${vivari.homepage}`,
    `sw.js 是其预览 Service Worker，仅去掉了放行 /@fs/ 的一条规则（修改见 src/workbench/terminal/vivari-service-worker.ts）。`,
    `vendor/ 下的打包件来自 ${VENDOR_BASE}，内含 npm、pnpm、yarn、corepack，各自沿用上游许可证：`,
    ...VENDOR_PACKS.map(pack => `  ${pack.name}  sha256=${pack.sha256}`),
    ''
  ].join('\n')
);
await writePagesConfig(output, RUNTIME_HOSTS.vivari, ['/runtime-host.html', '/preview-frame.html']);
// Nodepod：预览 Service Worker 注册在源根；进程 Worker 按「库文件旁的 ./__worker__.js」探测（打包后就是源根）
const { root: nodepodRoot, manifest: nodepod } = await packageOf('@r1ck404/nodepod');
const nodepodOutput = join(outputRoot, 'nodepod');
await mkdir(join(nodepodOutput, 'licenses'), { recursive: true });
// - 库里给 Node / Bun 无头模式用的 `await import('node:…')` 都包在 try 里，浏览器里不会走到；
// - package.json 的 sideEffects 只列了 src/ 路径，dist 分块被当成无副作用，浏览器宿主的注册
//   （顶层副作用）会被摇掉，报「No RuntimeHost registered」：忽略这份声明，保持和直接加载库一致
const nodepodScripts = await bundleEntries(
  { host: join(packageRoot, 'src/runtime-hosts/nodepod/host.ts') },
  nodepodOutput,
  { external: ['node:*'], ignoreAnnotations: true }
);
await writeFile(join(nodepodOutput, 'runtime-host.html'), page('Nodepod 运行时宿主', nodepodScripts.host));
for (const name of ['__sw__.js', '__worker__.js'])
  await copyFile(join(nodepodRoot, 'dist', name), join(nodepodOutput, name));
await copyFile(join(nodepodRoot, 'LICENSE'), join(nodepodOutput, 'licenses/nodepod.txt'));
await writeFile(
  join(nodepodOutput, 'NOTICE.txt'),
  [
    `@r1ck404/nodepod ${nodepod.version}（${nodepod.license}，仅内部评估，许可全文见 licenses/nodepod.txt）`,
    '运行时按需从 cdn.jsdelivr.net、esm.sh 取 esbuild-wasm、rollup、lightningcss 等，从 registry.npmjs.org 取 npm 包。',
    ''
  ].join('\n')
);
await writePagesConfig(nodepodOutput, RUNTIME_HOSTS.nodepod, ['/runtime-host.html']);
console.log(`运行时宿主已构建：${outputRoot}`);
