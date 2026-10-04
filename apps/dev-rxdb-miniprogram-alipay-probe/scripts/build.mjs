/**
 * 把实验打成可直接用支付宝小程序开发者工具打开的小程序目录。
 *
 * - `pages/index/index.js`：页面包，只含不依赖核心的实验与 Worker 桥接。
 * - `probe-core.js`：核心包，adapter 主入口 + 持久化 / 配额实验，由页面懒 `require`。
 * - `workers/index.js`：Worker 包，提供随机源并探 `MYWebAssembly`（`app.json` 的 `workers` 已声明）。
 *   已降到 ES5，`mini.project.json` 让 IDE 跳过它（见 `lowerWorkerToEs5`）。
 * - `wa-sqlite/wa-sqlite.wasm`：与 adapter glue 同源的 wasm，即 adapter 默认的相对路径。
 * - `wasm/add.wasm`：探针自带的最小模块，随 `static/` 复制。
 * - 每个 `.wasm` 旁边一份 `.base64.txt` 文本副本：模拟器把代码包文件当 UTF-8 文本读，二进制会被改写，
 *   只能读副本；iOS 真机代码包里没有 `.txt`（v3 探针实测 10022），只能读原文件。
 * - 每个 `.wasm` 的指纹（字节数 + FNV-1a）经 `define` 内嵌进页面包，实验 host 的 wasm 运行时据此在原文件与副本
 *   之间选对得上的那份（见 `alipay-host.ts` 的 `readCodePackageWasm`）。
 *
 * 直接打源码（`@aiao/source` 条件），不依赖上游 build。
 *
 * 页面包与核心包顶部都有探测 banner：模拟器逻辑层的 `globalThis` 是 `undefined`（v2 探针实测），banner 找到
 * 真实全局对象就存进模块变量，页面包经 `host.runtimeGlobal` 注入 adapter；每条候选路的结果都记进报告。
 * 核心包的探测记录同时充当「模块顶层跑完了」的绊线。
 *
 * 核心包另有一层 try/catch 包装（见 `coreInitErrorWrapper`），把模块顶层错误挂到导出上。
 */
import { transform } from '@swc/core';
import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Node 的类型剥离直接加载 .ts：指纹算法与运行时共用一份
import { fingerprintWasm } from '../src/wasm-fingerprint.ts';

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

/** 页面包里代码包 wasm 指纹的自由变量名，与 `src/page.ts` 的 `declare const` 一致。 */
export const WASM_FINGERPRINTS_VAR = '__aiaoSpikeWasmFingerprints';

/** 核心包导出上挂模块顶层错误的键名，必须与 `src/core-contract.ts` 的 `ProbeCore.initError` 一致。 */
export const CORE_INIT_ERROR_KEY = 'initError';

/**
 * 模块作用域里 `globalThis` 不是对象时，依次试四条路找真实全局对象：非严格函数的 `this`、
 * `Function('return this')()`、`global`、`Object.prototype` 上的临时 getter（自由变量查找以全局对象为 receiver，
 * 支付宝模拟器只有这一条走得通，v3 探针实测）。判据与 adapter 的 `resolveMiniProgramRuntimeGlobal` 相同：
 * 对象字面量 `{}` 的原型就是候选对象的 `Object.prototype`，且不读任何自由变量（抖音的包装函数连
 * `Promise`、`Function` 也换掉了，支付宝沿用同一判据）。第一个满足的存进 `RUNTIME_GLOBAL_VAR`，页面包经 `host.runtimeGlobal`
 * 交给 adapter——这是 adapter 公开 API 的用法，banner 自己不改 `globalThis`。
 * 每条路的结果存进 `REALM_PROBE_VAR`；除了第四条路读完即删的 getter，不往任何全局对象上写。
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

/** 三个包共用的 esbuild 选项。 */
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

/**
 * IDE 编译 Worker 时套 webpack + babel，并按 `transform-runtime` 换入 core-js 2 的 `Promise` 等实现；
 * core-js 的 `$export` 读自由变量 `Function`，Worker 里没有，模块顶层抛 `ReferenceError`，Worker 起不来
 * （模拟器实测）。`compileOptions.transpile.script.ignore` 能让 IDE 跳过转译，但被跳过的文件按 ES5 做语法检查
 * （CE1024 The keyword 'const' is reserved），esbuild 又降不到 ES5，只能再过一遍 swc：
 * async 与生成器变成内联 helper，只依赖原生 `Promise` 与 `Symbol`。
 * @param {string} code esbuild 的 ES2018 输出
 * @returns {Promise<string>}
 */
async function lowerWorkerToEs5(code) {
  const result = await transform(code, {
    isModule: false,
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es5', externalHelpers: false },
    minify: false
  });
  return result.code;
}

/** 与 `src/alipay-host.ts` 的 `WASM_TEXT_SUFFIX` 一致；`dist-smoke.spec.ts` 核对两边对得上。 */
const WASM_TEXT_SUFFIX = '.base64.txt';

/** 代码包里的 wasm，相对代码包根；每个都写文本副本、记指纹。 */
const WASM_FILES = ['wa-sqlite/wa-sqlite.wasm', 'wasm/add.wasm'];

/**
 * 给每个 wasm 写一份 base64 文本副本，返回每个 wasm 的指纹。
 * @param {string} outDir
 * @returns {Promise<Record<string, import('../src/wasm-fingerprint.ts').WasmFingerprint>>}
 */
async function writeWasmTextCopies(outDir) {
  const fingerprints = {};
  for (const path of WASM_FILES) {
    const bytes = await readFile(join(outDir, path));
    await writeFile(join(outDir, `${path}${WASM_TEXT_SUFFIX}`), bytes.toString('base64'));
    fingerprints[path] = fingerprintWasm(bytes);
  }
  return fingerprints;
}

/**
 * 构建到 `outDir`（默认 `dist/`），返回输出目录。
 * @param {string} [outDir]
 * @returns {Promise<string>}
 */
export async function buildProbe(outDir = join(projectRoot, 'dist')) {
  await rm(outDir, { recursive: true, force: true });
  await cp(join(projectRoot, 'static'), outDir, { recursive: true });
  await mkdir(join(outDir, 'wa-sqlite'), { recursive: true });
  await copyFile(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'), join(outDir, 'wa-sqlite/wa-sqlite.wasm'));
  const wasmFingerprints = await writeWasmTextCopies(outDir);
  await build({
    ...SHARED_OPTIONS,
    define: { ...SHARED_OPTIONS.define, [WASM_FINGERPRINTS_VAR]: JSON.stringify(wasmFingerprints) },
    entryPoints: [join(projectRoot, 'src/page.ts')],
    outfile: join(outDir, 'pages/index/index.js'),
    banner: { js: realmProbeBanner() },
    plugins: [keepCoreExternal]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'probe-core.js'),
    banner: { js: `${realmProbeBanner()}\n${coreInitErrorWrapper().banner}` },
    footer: { js: coreInitErrorWrapper().footer }
  });
  // Worker 里有 crypto、MYWebAssembly 与自由变量 worker，不需要 realm banner
  const worker = await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/worker.ts')],
    write: false
  });
  await mkdir(join(outDir, 'workers'), { recursive: true });
  await writeFile(join(outDir, 'workers/index.js'), await lowerWorkerToEs5(worker.outputFiles[0].text));
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`支付宝实验已构建到 ${await buildProbe()}`);
}
