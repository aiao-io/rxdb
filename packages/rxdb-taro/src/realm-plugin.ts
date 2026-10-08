import { posix } from 'node:path';
import type { Plugin } from 'vite';

/** 产物根目录下的真实全局对象登记模块，入口写、其余 chunk 读。 */
export const REALM_MODULE = 'rxdb-realm.js';
/** 产物里替换 `globalThis` 的标识符；每个用到它的 chunk 开头声明。 */
export const REALM_BINDING = '__rxdbRealm';

/** 需要构建期绑定 `globalThis` 的平台（Taro 平台名）。 */
export type RealmPlatform = 'tt' | 'alipay';

/** 支付宝入口临时挂在 `Object.prototype` 上的 getter 名，读完即删。 */
const REALM_GETTER = '__rxdbRealmGetter';

/** realm 判据同 adapter：对象字面量的原型就是它的 `Object.prototype`，不读任何可能被遮蔽的自由变量。 */
const REALM_MODULE_SOURCE = `"use strict";
let realm;
exports.capture = function (value) {
  if (typeof value !== "object" || value === null || typeof value.Object !== "function" || !value.Object.prototype.isPrototypeOf({})) {
    throw new Error("入口 app.js 登记到的不是真实全局对象（" + typeof value + "），产物里的 globalThis 无法绑定");
  }
  realm = value;
};
exports.realm = function () {
  if (realm === undefined) throw new Error("${REALM_MODULE} 在入口登记之前被读取：检查 app.js 开头的登记语句");
  return realm;
};
`;

/**
 * 入口 `app.js` 最前面声明 {@link REALM_BINDING} 的语句。
 *
 * - 抖音：模块里 `globalThis` 是 `undefined`，入口是唯一的非严格 chunk，非严格函数的 `this` 就是真实全局对象。
 * - 支付宝：iOS 真机有 `globalThis`；开发者工具模拟器逻辑层没有，非严格函数的 `this` 与 `Function` 也拿不到
 *   （US-211 支付宝探针 v3 实测），只有在 `Object.prototype` 上挂 getter、再按自由变量读，receiver 才是真实全局对象。
 *   同 adapter `hosts/alipay-runtime.ts` 的做法，属矩阵 `undocumented` 的 `object-prototype-global`。
 *
 * @param platform - Taro 平台名
 */
export function realmCaptureSource(platform: RealmPlatform): string {
  if (platform === 'tt') return `var ${REALM_BINDING}=function(){return this}();`;
  return (
    `var ${REALM_BINDING}=typeof globalThis==="object"&&globalThis!==null?globalThis:function(){` +
    `Object.defineProperty(Object.prototype,"${REALM_GETTER}",{configurable:true,get:function(){return this}});` +
    `try{return ${REALM_GETTER}}finally{delete Object.prototype.${REALM_GETTER}}}();`
  );
}

function realmRequestFrom(fileName: string): string {
  const request = posix.relative(posix.dirname(fileName), REALM_MODULE);
  return request.startsWith('.') ? request : `./${request}`;
}

/** 插在 `use strict` 指令之后，否则指令会失效。 */
function afterDirective(code: string, statements: string): string {
  const directive = /^\s*(["'])use strict\1;?/.exec(code);
  if (!directive) return statements + code;
  return code.slice(0, directive[0].length) + statements + code.slice(directive[0].length);
}

/**
 * 抖音与支付宝模拟器的模块里 `globalThis` 是 `undefined`（US-211 实测），第三方库照样在模块顶层读它
 * （comlink 的 `'FinalizationRegistry' in globalThis`），RxDB 核心运行时也读，`host.runtimeGlobal` 只管得到 adapter。
 *
 * 所以这两个平台的产物里所有自由的 `globalThis` 构建期改名为 {@link REALM_BINDING}：入口 `app.js` 在最前面按
 * {@link realmCaptureSource} 拿到真实全局对象、登记进 {@link REALM_MODULE}，其余 chunk 开头从那里取。
 * 拿到的不是真实全局对象时直接失败，不猜；抖音的入口带上 `use strict` 也直接失败。
 *
 * @param platform - Taro 平台名
 */
export function realmVitePlugin(platform: RealmPlatform): Plugin {
  return {
    name: 'aiao-rxdb-taro:realm',
    apply: 'build',
    config() {
      return { define: { globalThis: REALM_BINDING } };
    },
    generateBundle(_options, bundle) {
      const app = bundle['app.js'];
      if (app?.type !== 'chunk') {
        this.error('产物里没有入口 app.js，无法登记真实全局对象');
      }
      if (platform === 'tt' && /["']use strict["']/.test(app.code)) {
        this.error('入口 app.js 带了 use strict，非严格函数的 this 拿不到真实全局对象');
      }
      for (const chunk of Object.values(bundle)) {
        if (chunk === app || chunk.type !== 'chunk' || !chunk.code.includes(REALM_BINDING)) continue;
        chunk.code = afterDirective(
          chunk.code,
          `var ${REALM_BINDING}=require(${JSON.stringify(realmRequestFrom(chunk.fileName))}).realm();`
        );
      }
      app.code = afterDirective(
        app.code,
        `${realmCaptureSource(platform)}require("./${REALM_MODULE}").capture(${REALM_BINDING});`
      );
      this.emitFile({ type: 'asset', fileName: REALM_MODULE, source: REALM_MODULE_SOURCE });
    }
  };
}
