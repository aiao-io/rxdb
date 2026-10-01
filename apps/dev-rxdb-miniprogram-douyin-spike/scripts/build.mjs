/**
 * 把实验打成可直接用抖音开发者工具打开的小程序目录。
 *
 * - `pages/index/index.js`：页面包，只含 `/runtime` 与不依赖核心的实验。
 * - `spike-core.js`：核心包，adapter 主入口 + 持久化 / 配额实验，由页面懒 `require`。
 * - `wa-sqlite/wa-sqlite.wasm`：与 adapter glue 同源的 wasm，路径即 adapter 的 `DEFAULT_WASM_PATH`。
 *
 * 直接打源码（`@aiao/source` 条件），不依赖上游 build。
 *
 * 两个包顶部都有 `globalThis` 垫片 banner：抖音页面模块里 `globalThis` 是 `undefined`，`global` 是对象但不是
 * 真实全局对象（上面没有 `BigInt` / `Promise`）。adapter 全靠 `globalThis`，不垫就测不到持久化与配额。
 * banner 只在能拿到真实全局对象时才垫，每条候选路的结果都记进报告。垫片只存在于本实验产物。
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

/** banner 声明的模块级变量名，必须与 `src/global-this-shim.ts` 读取的自由变量一致。 */
export const GLOBAL_THIS_SHIM_VAR = '__aiaoSpikeGlobalThisShim';

/**
 * 模块作用域里 `globalThis` 不是对象时，依次试三条路拿真实全局对象：非严格函数的 `this`、
 * `Function('return this')()`、`global`。判据是对象字面量 `{}` 的原型就是候选对象的 `Object.prototype`——
 * 只有本环境的真实全局对象满足，且不读任何自由变量（抖音的包装函数连 `Promise`、`Function` 也换掉了）。
 * 第一个满足的换进 `globalThis` 绑定（赋值落在包装函数遮蔽它的那个绑定上，不碰全局），
 * 一个都不满足就不垫，让 adapter 按现状失败。记录存进本模块的变量，不往任何全局对象上写。
 * @returns {string}
 */
function globalThisShimBanner() {
  return `var ${GLOBAL_THIS_SHIM_VAR} = (function () {
  var record = { before: typeof globalThis, candidates: {}, chosen: null, applied: false };
  if (record.before === 'object') return record;
  var target;
  function inspect(name, read) {
    var value;
    try {
      value = read();
    } catch (cause) {
      record.candidates[name] = { error: String(cause) };
      return;
    }
    var isObject = typeof value === 'object' && value !== null;
    // 对象字面量的原型永远是本环境的 Object.prototype；只用候选对象自己的方法，不读任何可能被遮蔽的自由变量
    var isRealm = isObject && typeof value.Object === 'function' && value.Object.prototype.isPrototypeOf({});
    record.candidates[name] = {
      type: typeof value,
      isRealm: isRealm,
      promiseMatchesFree: isObject && value.Promise === Promise,
      BigInt: isObject ? typeof value.BigInt : 'n/a',
      queueMicrotask: isObject ? typeof value.queueMicrotask : 'n/a'
    };
    if (isRealm && record.chosen === null) {
      record.chosen = name;
      target = value;
    }
  }
  inspect('sloppyThis', function () {
    return (function () {
      return this;
    })();
  });
  inspect('Function', function () {
    return Function('return this')();
  });
  inspect('global', function () {
    return global;
  });
  if (record.chosen === null) return record;
  try {
    globalThis = target;
    record.applied = true;
  } catch (cause) {
    record.error = String(cause);
  }
  return record;
})();`;
}

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
    banner: { js: globalThisShimBanner() },
    plugins: [keepCoreExternal]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'spike-core.js'),
    banner: { js: globalThisShimBanner() }
  });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`抖音实验已构建到 ${await buildSpike()}`);
}
