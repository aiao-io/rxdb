/**
 * 把实验打成可直接用抖音开发者工具打开的小程序目录。
 *
 * - `pages/index/index.js`：页面包，只含 `/runtime` 与不依赖核心的实验。
 * - `spike-core.js`：核心包，adapter 主入口 + 持久化 / 配额实验，由页面懒 `require`。
 * - `wa-sqlite/wa-sqlite.wasm`：与 adapter glue 同源的 wasm，即实验 host 的 `defaultWasmPath`（代码包根的 `/wa-sqlite/wa-sqlite.wasm`）。
 *
 * 直接打源码（`@aiao/source` 条件），不依赖上游 build。
 *
 * 两个包顶部都有探测 banner：抖音页面模块里 `globalThis` 是 `undefined`，`global` 是对象但不是真实全局对象
 * （上面没有 `BigInt` / `Promise`）。banner 找到真实全局对象就存进模块变量，页面包经 `host.runtimeGlobal` 注入
 * adapter；每条候选路的结果都记进报告。核心包的探测记录同时充当「模块顶层跑完了」的绊线。
 *
 * 核心包另有一层 try/catch 包装（见 `coreInitErrorWrapper`），把模块顶层错误挂到导出上。
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

/** banner 声明的探测记录变量名，必须与 `src/realm-probe.ts` 读取的自由变量一致。 */
export const REALM_PROBE_VAR = '__aiaoSpikeRealmProbe';

/** banner 声明的真实全局对象变量名，必须与 `src/realm-probe.ts` 读取的自由变量一致。 */
export const RUNTIME_GLOBAL_VAR = '__aiaoSpikeRuntimeGlobal';

/** 核心包导出上挂模块顶层错误的键名，必须与 `src/core-contract.ts` 的 `SpikeCore.initError` 一致。 */
export const CORE_INIT_ERROR_KEY = 'initError';

/**
 * 模块作用域里 `globalThis` 不是对象时，依次试三条路找真实全局对象：非严格函数的 `this`、
 * `Function('return this')()`、`global`。判据与 adapter 的 `resolveMiniProgramRuntimeGlobal` 相同：
 * 对象字面量 `{}` 的原型就是候选对象的 `Object.prototype`，且不读任何自由变量（抖音的包装函数连
 * `Promise`、`Function` 也换掉了）。第一个满足的存进 `RUNTIME_GLOBAL_VAR`，页面包经 `host.runtimeGlobal`
 * 交给 adapter——这是 adapter 公开 API 的用法，banner 自己不改 `globalThis`。
 * 每条路的结果存进 `REALM_PROBE_VAR`，不往任何全局对象上写。
 * @returns {string}
 */
function realmProbeBanner() {
  return `var ${RUNTIME_GLOBAL_VAR};
var ${REALM_PROBE_VAR} = (function () {
  var record = { before: typeof globalThis, candidates: {}, chosen: null };
  if (record.before === 'object') return record;
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
      ${RUNTIME_GLOBAL_VAR} = value;
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
  return record;
})();`;
}

/**
 * 核心包外层的 try/catch：iOS 真机的 `require` 吞掉模块顶层错误、返回半成品导出（v6 报告），
 * 报告里只剩调用半成品时的次生错误。包装把原始错误挂到导出上再原样抛出，平台怎么处理照旧。
 * 模块体包进函数，免得块级函数声明的提升规则改变语义。
 * @returns {{ banner: string, footer: string }}
 */
export function coreInitErrorWrapper() {
  return {
    banner: 'try {\n(function () {',
    footer: `}).call(this);\n} catch (cause) {\n  module.exports.${CORE_INIT_ERROR_KEY} = cause;\n  throw cause;\n}`
  };
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
    banner: { js: realmProbeBanner() },
    plugins: [keepCoreExternal]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'spike-core.js'),
    banner: { js: `${realmProbeBanner()}\n${coreInitErrorWrapper().banner}` },
    footer: { js: coreInitErrorWrapper().footer }
  });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`抖音实验已构建到 ${await buildSpike()}`);
}
