/**
 * 把实验打成可直接用支付宝小程序开发者工具打开的小程序目录。
 *
 * - `pages/index/index.js`：页面包，正式支付宝 host + 不依赖核心的实验。
 * - `probe-core.js`：核心包，adapter 主入口 + 持久化 / 配额实验，由页面懒 `require`。
 * - `workers/index.js`：adapter 包里预编译的 ES5 随机数 Worker（`alipay-random-worker.js`）原样拷贝；
 *   `app.json` 的 `workers` 已声明，`mini.project.json` 让 IDE 跳过转译（IDE 的 babel 换入的 core-js
 *   读自由变量 `Function`，Worker 里没有，模拟器实测 Worker 起不来）。
 * - `wa-sqlite/wa-sqlite.wasm`：与 adapter glue 同源的 wasm，即 adapter 默认的相对路径。
 * - 旁边一份 `.base64.txt` 文本副本：模拟器把代码包文件当 UTF-8 文本读，二进制会被改写，只能读副本；
 *   iOS 真机代码包里没有 `.txt`（v3 探针实测 10022），只能读原文件。正式 host 按 adapter 里锁定版本的指纹
 *   在两者之间选对得上的那份（见 adapter 的 `readAlipayCodePackageWasm`）。
 *
 * 直接打源码（`@aiao/source` 条件），不依赖上游 build。
 *
 * 页面包与核心包顶部都有探测 banner：模拟器逻辑层的 `globalThis` 是 `undefined`（v2 探针实测），banner 找到
 * 真实全局对象就存进模块变量，供环境实验对照；交给 adapter 的全局对象由正式 host 自己找。每条候选路的结果都记进报告。
 * 核心包的探测记录同时充当「模块顶层跑完了」的绊线。
 *
 * 核心包另有一层 try/catch 包装（见 `coreInitErrorWrapper`），把模块顶层错误挂到导出上。
 */
import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { subframeRealmPlugin } from '../../../scripts/esbuild/subframe-realm.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

// 本 app 没有自己的 package.json，wasm 依赖挂在 adapter 名下
const adapterRequire = createRequire(
  new URL('../../../packages/rxdb-adapter-miniprogram/package.json', import.meta.url)
);

/** 页面包里懒加载核心包的字面量路径，必须与 `src/page.ts` 一致。 */
export const CORE_REQUEST = '../../probe-core.js';

/** banner 声明的探测记录变量名，必须与 `src/realm-probe.ts` 读取的自由变量一致。 */
export const REALM_PROBE_VAR = '__aiaoSpikeRealmProbe';

/** banner 声明的真实全局对象变量名，必须与 `src/realm-probe.ts` 读取的自由变量一致。 */
export const RUNTIME_GLOBAL_VAR = '__aiaoSpikeRuntimeGlobal';

/** `objectPrototypeGetter` 候选路在 `Object.prototype` 上临时定义的 getter 名。 */
const REALM_GETTER_KEY = '__aiaoSpikeRealmGlobal';

/** 核心包导出上挂模块顶层错误的键名，必须与 `src/core-contract.ts` 的 `ProbeCore.initError` 一致。 */
export const CORE_INIT_ERROR_KEY = 'initError';

/**
 * 模块作用域里 `globalThis` 不是对象时，依次试四条路找真实全局对象：非严格函数的 `this`、
 * `Function('return this')()`、`global`、`Object.prototype` 上的临时 getter（自由变量查找以全局对象为 receiver，
 * 支付宝模拟器只有这一条走得通，v3 探针实测）。判据与 adapter 的 `resolveMiniProgramRuntimeGlobal` 相同：
 * 对象字面量 `{}` 的原型就是候选对象的 `Object.prototype`，且不读任何自由变量（抖音的包装函数连
 * `Promise`、`Function` 也换掉了，支付宝沿用同一判据）。第一个满足的存进 `RUNTIME_GLOBAL_VAR`，环境实验拿它与正式 host 找到的
 * 全局对象对照；banner 自己不改 `globalThis`。
 * 每条路的结果存进 `REALM_PROBE_VAR`；除了第四条路读完即删的 getter，不往任何全局对象上写。
 * @returns {string}
 */
function realmProbeBanner() {
  return `var ${RUNTIME_GLOBAL_VAR} = typeof globalThis === "object" ? globalThis : undefined;
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
  // 自由变量查找落到全局对象上时，原型链 getter 的 this 就是全局对象本身；读完立刻删掉
  inspect('objectPrototypeGetter', function () {
    Object.defineProperty(Object.prototype, '${REALM_GETTER_KEY}', {
      configurable: true,
      get: function () {
        return this;
      }
    });
    try {
      return ${REALM_GETTER_KEY};
    } finally {
      delete Object.prototype.${REALM_GETTER_KEY};
    }
  });
  return record;
})();`;
}

/**
 * 核心包外层的 try/catch：抖音 iOS 真机的 `require` 吞掉模块顶层错误、返回半成品导出，支付宝沿用同一包装，
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

/** 页面包与核心包共用的 esbuild 选项。 */
const SHARED_OPTIONS = {
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  // 支付宝开发者工具的编译器不认 ES2020 的 `?.` / `??`，也不认 ES2019 的可选 catch 绑定（模拟器编译报
  // CE1000.02 Unexpected token），真机预览与真机调试走同一个编译器，只能在打包时降到 ES2018
  target: 'es2018',
  // ES2018 没有 BigInt 字面量，esbuild 改写成 `BigInt("1")`：语法过得了编译器，运行时才依赖 `BigInt`。
  // 模拟器逻辑层没有 `BigInt`、iOS 有（v2 探针实测），有没有用由报告的 environment 与 adapter 预检回答
  logOverride: { bigint: 'silent' },
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
    pluginBuild.onResolve({ filter: /^\.\.\/\.\.\/probe-core\.js$/ }, args => ({ path: args.path, external: true }));
  }
};

/** 与 adapter 的 `ALIPAY_WASM_TEXT_COPY_SUFFIX` 一致；`dist-smoke.spec.ts` 核对两边对得上。 */
const WASM_TEXT_SUFFIX = '.base64.txt';

/** adapter 默认的 wasm 路径，相对代码包根。 */
const WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';

/** adapter 包导出的 `./alipay-random-worker.js`。 */
const RANDOM_WORKER_EXPORT = '@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js';

/**
 * 构建到 `outDir`（默认 `dist/`），返回输出目录。
 * @param {string} [outDir]
 * @returns {Promise<string>}
 */
export async function buildProbe(outDir = join(projectRoot, 'dist')) {
  await rm(outDir, { recursive: true, force: true });
  await cp(join(projectRoot, 'static'), outDir, { recursive: true });
  await mkdir(join(outDir, 'wa-sqlite'), { recursive: true });
  const wasm = await readFile(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'));
  await writeFile(join(outDir, WASM_PATH), wasm);
  await writeFile(join(outDir, `${WASM_PATH}${WASM_TEXT_SUFFIX}`), wasm.toString('base64'));
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/page.ts')],
    outfile: join(outDir, 'pages/index/index.js'),
    banner: { js: realmProbeBanner() },
    plugins: [keepCoreExternal, subframeRealmPlugin(RUNTIME_GLOBAL_VAR)]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'probe-core.js'),
    banner: { js: `${realmProbeBanner()}\n${coreInitErrorWrapper().banner}` },
    footer: { js: coreInitErrorWrapper().footer },
    plugins: [subframeRealmPlugin(RUNTIME_GLOBAL_VAR)]
  });
  await mkdir(join(outDir, 'workers'), { recursive: true });
  await copyFile(adapterRequire.resolve(RANDOM_WORKER_EXPORT), join(outDir, 'workers/index.js'));
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`支付宝实验已构建到 ${await buildProbe()}`);
}
