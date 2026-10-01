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
 *
 * 核心包另有一层 try/catch 包装（见 `coreInitErrorWrapper`），把模块顶层错误挂到导出上；包装同时把模块体里的
 * `TextDecoder` 换成 latin1 垫片（见 `latin1ShimBanner`），iOS 真机没有原生 TextDecoder 时核心包才加载得起来。
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

/** 核心包导出上挂模块顶层错误的键名，必须与 `src/core-contract.ts` 的 `SpikeCore.initError` 一致。 */
export const CORE_INIT_ERROR_KEY = 'initError';

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

/**
 * 核心包 latin1 垫片的构造函数名：包装函数把它作为形参 `TextDecoder` 传进模块体，见 `coreInitErrorWrapper`。
 * 必须与 `src/latin1-shim.spec.ts` 读取的名字一致。
 */
export const LATIN1_TEXT_DECODER_VAR = '__aiaoSpikeTextDecoder';

/** 垫片记录的模块级变量名，必须与 `src/latin1-shim.ts` 读取的自由变量一致。 */
export const LATIN1_SHIM_VAR = '__aiaoSpikeLatin1Shim';

/**
 * latin1 垫片：iOS 真机没有原生 `TextDecoder`，adapter polyfill 不认 latin1，sqlite-core 模块顶层的
 * `new TextDecoder('latin1')` 让核心包加载即 RangeError（v7 报告）。垫片在构造时读模块作用域的自由变量
 * `TextDecoder`（即 polyfill 或原生实现，读法与不垫时完全相同），latin1 一族标签先交给它，只有它抛 RangeError
 * 才顶上，并把次数与原始错误记进 `LATIN1_SHIM_VAR`；其余标签与其余错误原样交还。
 * 自由变量根本不存在时照样 ReferenceError，不凭空造一个 TextDecoder。
 *
 * 顶上的解码器把每个字节映射成同码点字符：256 个字节一一对应不同字符，满足 sqlite-blank-database 只拿它比较
 * 字节是否相同的用法；0x80–0x9F 不复刻 windows-1252 的映射表。
 * @returns {string}
 */
export function latin1ShimBanner() {
  return `var ${LATIN1_SHIM_VAR} = { engaged: 0, delegateError: null };
function ${LATIN1_TEXT_DECODER_VAR}(label, options) {
  var normalized = String(label).trim().toLowerCase();
  var isLatin1 = ['latin1', 'iso-8859-1', 'iso8859-1', 'l1', 'windows-1252', 'cp1252', 'ascii', 'us-ascii'].indexOf(normalized) !== -1;
  if (!isLatin1) return new TextDecoder(label, options);
  try {
    return new TextDecoder(label, options);
  } catch (cause) {
    if (!cause || cause.name !== 'RangeError') throw cause;
    ${LATIN1_SHIM_VAR}.engaged += 1;
    if (${LATIN1_SHIM_VAR}.delegateError === null) ${LATIN1_SHIM_VAR}.delegateError = String(cause);
  }
  return {
    encoding: 'windows-1252',
    decode: function (input) {
      if (input === undefined) return '';
      var bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);
      var parts = [];
      for (var start = 0; start < bytes.length; start += 0x2000) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(start, start + 0x2000)));
      }
      return parts.join('');
    }
  };
}`;
}

/**
 * 核心包外层的 try/catch：iOS 真机的 `require` 吞掉模块顶层错误、返回半成品导出（v6 报告），
 * 报告里只剩调用半成品时的次生错误。包装把原始错误挂到导出上再原样抛出，平台怎么处理照旧。
 * 模块体包进函数，免得块级函数声明的提升规则改变语义；函数的形参 `TextDecoder` 接 latin1 垫片，
 * 遮住模块体里所有对 `TextDecoder` 的引用，而 `globalThis.TextDecoder`（adapter 能力预检读的那个）不受影响。
 * @returns {{ banner: string, footer: string }}
 */
function coreInitErrorWrapper() {
  return {
    banner: 'try {\n(function (TextDecoder) {',
    footer:
      `}).call(this, ${LATIN1_TEXT_DECODER_VAR});\n` +
      `} catch (cause) {\n  module.exports.${CORE_INIT_ERROR_KEY} = cause;\n  throw cause;\n}`
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
    banner: { js: globalThisShimBanner() },
    plugins: [keepCoreExternal]
  });
  await build({
    ...SHARED_OPTIONS,
    entryPoints: [join(projectRoot, 'src/core.ts')],
    outfile: join(outDir, 'spike-core.js'),
    banner: { js: `${globalThisShimBanner()}\n${latin1ShimBanner()}\n${coreInitErrorWrapper().banner}` },
    footer: { js: coreInitErrorWrapper().footer }
  });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`抖音实验已构建到 ${await buildSpike()}`);
}
