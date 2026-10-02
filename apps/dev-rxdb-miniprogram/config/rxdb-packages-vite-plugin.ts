import { transformAsync } from '@babel/core';
import { posix } from 'node:path';
import type { Plugin } from 'vite';

function isLinkedPackageDist(id: string): boolean {
  const cleanId = id.split('?')[0];
  return cleanId.includes('/packages/') && cleanId.includes('/dist/') && cleanId.endsWith('.js');
}

export function rxdbPackagesVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:rxdb-private-members',
    enforce: 'pre',
    async transform(code, id) {
      if (!isLinkedPackageDist(id) || !code.includes('#')) return null;
      const result = await transformAsync(code, {
        babelrc: false,
        configFile: false,
        filename: id.split('?')[0],
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }]
        ],
        sourceMaps: true,
        sourceType: 'module'
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    }
  };
}

/** `@subframe7536/sqlite-wasm` 的 Emscripten glue 文件名带内容哈希，只认前缀。 */
const SUBFRAME_GLUE_PATTERN = /[\\/]@subframe7536[\\/]sqlite-wasm[\\/]dist[\\/]wa-sqlite-[^\\/]+\.js$/;

function isSubframeGlue(id: string): boolean {
  return SUBFRAME_GLUE_PATTERN.test(id.split('?')[0]);
}

/**
 * 把 subframe glue 里的 `import.meta.url` 抹成空串。
 *
 * 小程序运行时没有 `import.meta`，而这个包发的是 ESM。glue 里只有两处用到它：
 * 模块初始化时的 `_scriptName`，和 `findWasmBinary()` 里的默认 wasm 定位；后者在我们
 * 显式传 `locateFile` + `instantiateWasm` 时根本走不到，前者只在 web / worker 分支被读。
 * 所以换成空串既能过小程序的解析，又不改变实际行为。
 */
export function subframeSqliteWasmVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:subframe-sqlite-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!isSubframeGlue(id) || !code.includes('import.meta.url')) return null;
      return { code: code.replace(/import\.meta\.url/g, '""'), map: null };
    }
  };
}

export function rxdbBuildTargetVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:rxdb-es2020-target',
    enforce: 'post',
    config() {
      return { build: { target: 'es2020' } };
    }
  };
}

/** 产物根目录下的真实全局对象登记模块，入口写、其余 chunk 读。 */
const REALM_MODULE = 'rxdb-realm.js';
/** 产物里替换 `globalThis` 的标识符；每个用到它的 chunk 开头声明。 */
const REALM_BINDING = '__rxdbRealm';

/** realm 判据同 adapter：对象字面量的原型就是它的 `Object.prototype`，不读任何可能被遮蔽的自由变量。 */
const REALM_MODULE_SOURCE = `"use strict";
let realm;
exports.capture = function (value) {
  if (typeof value !== "object" || value === null || typeof value.Object !== "function" || !value.Object.prototype.isPrototypeOf({})) {
    throw new Error("入口 app.js 拿不到真实全局对象（非严格函数的 this 是 " + typeof value + "），抖音产物无法绑定 globalThis");
  }
  realm = value;
};
exports.realm = function () {
  if (realm === undefined) throw new Error("${REALM_MODULE} 在入口登记之前被读取：检查 app.js 开头的登记语句");
  return realm;
};
`;

function realmRequestFrom(fileName: string): string {
  const request = posix.relative(posix.dirname(fileName), REALM_MODULE);
  return request.startsWith('.') ? request : `./${request}`;
}

/** 插在 `use strict` 指令之后，否则指令会失效。 */
function bindRealm(code: string, fileName: string): string {
  const declaration = `var ${REALM_BINDING}=require(${JSON.stringify(realmRequestFrom(fileName))}).realm();`;
  const directive = /^\s*(["'])use strict\1;?/.exec(code);
  if (!directive) return declaration + code;
  return code.slice(0, directive[0].length) + declaration + code.slice(directive[0].length);
}

/**
 * 抖音的模块里 `globalThis` 是 `undefined`（US-211 实验实测），第三方库照样在模块顶层读它
 * （comlink 的 `'FinalizationRegistry' in globalThis`），RxDB 核心运行时也读，`host.runtimeGlobal` 只管得到 adapter。
 *
 * 所以抖音产物里所有自由的 `globalThis` 构建期改名为 {@link REALM_BINDING}：入口 `app.js` 是唯一的非严格 chunk，
 * 它在最前面把非严格函数的 `this` 登记进 {@link REALM_MODULE}，其余 chunk 开头从那里取。入口带上 `use strict`、
 * 或 `this` 不是真实全局对象时直接失败，不猜。
 */
export function douyinRealmVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:douyin-realm',
    apply: 'build',
    config() {
      return { define: { globalThis: REALM_BINDING } };
    },
    generateBundle(_options, bundle) {
      const app = bundle['app.js'];
      if (app?.type !== 'chunk') {
        this.error('产物里没有入口 app.js，无法登记真实全局对象');
      }
      if (/["']use strict["']/.test(app.code)) {
        this.error('入口 app.js 带了 use strict，非严格函数的 this 拿不到真实全局对象');
      }
      for (const chunk of Object.values(bundle)) {
        if (chunk === app || chunk.type !== 'chunk' || !chunk.code.includes(REALM_BINDING)) continue;
        chunk.code = bindRealm(chunk.code, chunk.fileName);
      }
      app.code = `var ${REALM_BINDING}=function(){return this}();require("./${REALM_MODULE}").capture(${REALM_BINDING});${app.code}`;
      this.emitFile({ type: 'asset', fileName: REALM_MODULE, source: REALM_MODULE_SOURCE });
    }
  };
}
