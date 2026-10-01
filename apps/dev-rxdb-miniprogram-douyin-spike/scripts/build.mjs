/**
 * 把实验打成可直接用抖音开发者工具打开的小程序目录。
 *
 * - `pages/index/index.js`：页面包，只含 `/runtime` 与不依赖核心的实验。
 * - `spike-core.js`：核心包，adapter 主入口 + 持久化 / 配额实验，由页面懒 `require`。
 * - `wa-sqlite/wa-sqlite.wasm`：与 adapter glue 同源的 wasm，路径即 adapter 的 `DEFAULT_WASM_PATH`。
 *
 * 直接打源码（`@aiao/source` 条件），不依赖上游 build。
 */
import { build } from 'esbuild';
import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

// 本 app 没有自己的 package.json，wasm 依赖挂在 adapter 名下
const adapterRequire = createRequire(
  new URL('../../../packages/rxdb-adapter-miniprogram/package.json', import.meta.url)
);

/** 页面包里懒加载核心包的字面量路径，必须与 `src/page.ts` 一致。 */
export const CORE_REQUEST = '../../spike-core.js';

/** 两个包共用的 esbuild 选项。 */
const SHARED_OPTIONS = {
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  conditions: ['@aiao/source'],
  // 运行时用不到 import.meta.url，CJS 输出里给空串，免得 esbuild 报警告
  define: { 'import.meta.url': '""' },
  charset: 'utf8',
  legalComments: 'none',
  logLevel: 'warning'
};

/** 让页面包对核心包的 `require` 原样保留。 */
const keepCoreExternal = {
  name: 'keep-core-external',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\.\/\.\.\/spike-core\.js$/ }, args => ({ path: args.path, external: true }));
  }
};

/**
 * 构建到 `outDir`（默认 `dist/`），返回输出目录。
 * @param {string} [outDir]
 * @returns {Promise<string>}
 */
export async function buildSpike(outDir = join(projectRoot, 'dist')) {
  await rm(outDir, { recursive: true, force: true });
  await cp(join(projectRoot, 'static'), outDir, { recursive: true });
  await mkdir(join(outDir, 'wa-sqlite'), { recursive: true });
  await copyFile(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'), join(outDir, 'wa-sqlite/wa-sqlite.wasm'));
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/page.ts')],
    outfile: join(outDir, 'pages/index/index.js'),
    plugins: [keepCoreExternal]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'spike-core.js')
  });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`抖音实验已构建到 ${await buildSpike()}`);
}
