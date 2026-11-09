import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { REALM_BINDING, REALM_MODULE, realmCaptureSource, realmVitePlugin } from '../realm-plugin.js';

interface FakeChunk {
  type: 'chunk';
  fileName: string;
  code: string;
}

type Bundle = Record<string, FakeChunk | { type: 'asset'; fileName: string; source: string }>;

function chunk(fileName: string, code: string): FakeChunk {
  return { type: 'chunk', fileName, code };
}

/** 跑 generateBundle，收集 emitFile 发出的文件。 */
function generate(platform: 'tt' | 'alipay', bundle: Bundle) {
  const plugin = realmVitePlugin(platform);
  const emitted: { fileName: string; source: string }[] = [];
  const context = {
    error(message: string): never {
      throw new Error(message);
    },
    emitFile(file: { fileName: string; source: string }) {
      emitted.push(file);
      return file.fileName;
    }
  };
  const generateBundle = plugin.generateBundle as (this: unknown, options: unknown, bundle: Bundle) => void;
  generateBundle.call(context, {}, bundle);
  return emitted;
}

/** 在同一个新 realm 里按 CommonJS 跑登记模块与入口，返回登记到的对象与该 realm 的全局对象。 */
function runCapture(appCode: string, realmModule: string, shadowGlobalThis: boolean) {
  const context = createContext();
  const registry = runInContext(
    `(function () { var module = { exports: {} }; (function (exports) { ${realmModule} })(module.exports); return module.exports; })()`,
    context
  ) as { realm(): unknown };
  // 支付宝模拟器逻辑层：模块作用域里 globalThis 是 undefined，只有自由变量查找还落在真实全局对象上
  const parameters = shadowGlobalThis ? 'globalThis, require' : 'require';
  const run = runInContext(`(function (${parameters}) { ${appCode} })`, context) as (...args: unknown[]) => void;
  const require = () => registry;
  if (shadowGlobalThis) run(undefined, require);
  else run(require);
  return {
    captured: registry.realm(),
    realmGlobal: runInContext('this', context) as object,
    leftovers: runInContext(
      'Object.getOwnPropertyNames(Object.prototype).filter(function (name) { return name.indexOf("__rxdb") === 0; })',
      context
    ) as string[]
  };
}

describe('realmVitePlugin 的公共部分', () => {
  it('构建期把自由的 globalThis 改名为绑定，只在 build 生效', () => {
    const plugin = realmVitePlugin('alipay');
    const config = plugin.config as () => unknown;

    expect(plugin.apply).toBe('build');
    expect(config()).toEqual({ define: { globalThis: REALM_BINDING } });
  });

  it('用到绑定的非入口 chunk 在 use strict 之后从登记模块取，没用到的不动；入口最前面登记', () => {
    const bundle: Bundle = {
      'app.js': chunk('app.js', `require("./taro.js");${REALM_BINDING}.x;`),
      'taro.js': chunk('taro.js', `"use strict";${REALM_BINDING}.y;`),
      'pages/index/index.js': chunk('pages/index/index.js', `${REALM_BINDING}.z;`),
      'babelHelpers.js': chunk('babelHelpers.js', '"use strict";exports.a=1;')
    };
    const emitted = generate('alipay', bundle);

    expect((bundle['taro.js'] as FakeChunk).code).toBe(
      `"use strict";var ${REALM_BINDING}=require("./${REALM_MODULE}").realm();${REALM_BINDING}.y;`
    );
    expect((bundle['pages/index/index.js'] as FakeChunk).code).toBe(
      `var ${REALM_BINDING}=require("../../${REALM_MODULE}").realm();${REALM_BINDING}.z;`
    );
    expect((bundle['babelHelpers.js'] as FakeChunk).code).toBe('"use strict";exports.a=1;');
    expect(
      (bundle['app.js'] as FakeChunk).code.endsWith(
        `require("./${REALM_MODULE}").capture(${REALM_BINDING});require("./taro.js");${REALM_BINDING}.x;`
      )
    ).toBe(true);
    expect(emitted.map(file => file.fileName)).toEqual([REALM_MODULE]);
  });

  it('产物里没有入口 app.js 时报错', () => {
    expect(() => generate('tt', {})).toThrow(/app\.js/);
  });
});

// RV-01a1bb4c7db9：登记语句只能插在整段指令序言之后。版权 banner、行注释、前置的其他指令、
// 无分号换行都不能让插入点落到 use strict 前面——那样指令变成普通表达式，chunk 静默变成非严格
describe('realmVitePlugin：指令序言', () => {
  const realmRequire = `var ${REALM_BINDING}=require("./${REALM_MODULE}").realm();`;

  /** 把改写后的 chunk 当 CommonJS 模块函数体执行，返回其顶层是否仍是严格模式。 */
  function runsStrict(code: string): boolean {
    const run = runInContext(
      `(function (require, exports) {${code}\n;return (function () { return this; })() === undefined; })`,
      createContext()
    ) as (require: () => { realm(): object }, exports: object) => boolean;
    return run(() => ({ realm: () => ({}) }), {});
  }

  function rewrite(code: string): string {
    const bundle: Bundle = { 'app.js': chunk('app.js', ''), 'vendor.js': chunk('vendor.js', code) };
    generate('alipay', bundle);
    return (bundle['vendor.js'] as FakeChunk).code;
  }

  it.each([
    ['块注释 banner', `/*! license */\n"use strict";${REALM_BINDING}.x;`, `/*! license */\n"use strict";`],
    ['行注释', `// generated\n'use strict';${REALM_BINDING}.x;`, `// generated\n'use strict';`],
    ['前置的其他指令', `"use client";"use strict";${REALM_BINDING}.x;`, `"use client";"use strict";`],
    ['指令之间夹注释', `'use client'; /* keep */ "use strict" ;${REALM_BINDING}.x;`, `'use client'; /* keep */ "use strict" ;`]
  ])('%s：插在指令序言之后，chunk 仍是严格模式', (_case, code, prologue) => {
    const rewritten = rewrite(code);

    expect(rewritten.startsWith(`${prologue}${realmRequire}`)).toBe(true);
    expect(runsStrict(rewritten)).toBe(true);
  });

  it('无分号换行结束的指令：补上分号再插，chunk 仍是严格模式', () => {
    const rewritten = rewrite(`"use strict"\nexports.a = ${REALM_BINDING};`);

    expect(rewritten).toBe(`"use strict";${realmRequire}\nexports.a = ${REALM_BINDING};`);
    expect(runsStrict(rewritten)).toBe(true);
  });

  it('非严格 chunk 插在最前面，仍是非严格；开头的字符串若接着参与表达式就不是指令', () => {
    const sloppy = rewrite(`exports.a = ${REALM_BINDING};`);
    const continued = rewrite(`"use strict"\n.length;${REALM_BINDING}.x;`);

    expect(sloppy.startsWith(realmRequire)).toBe(true);
    expect(runsStrict(sloppy)).toBe(false);
    expect(continued.startsWith(realmRequire)).toBe(true);
  });

  it('转义写出来的 use strict 不是严格指令', () => {
    const rewritten = rewrite(`"use\\x20strict";${REALM_BINDING}.x;`);

    expect(rewritten.startsWith(`"use\\x20strict";${realmRequire}`)).toBe(true);
    expect(runsStrict(rewritten)).toBe(false);
  });

  it('抖音入口：banner 或前置指令之后的 use strict 同样按严格入口拒绝', () => {
    expect(() => generate('tt', { 'app.js': chunk('app.js', '/*! license */\n"use strict";') })).toThrow(
      /use strict/
    );
    expect(() => generate('tt', { 'app.js': chunk('app.js', '"use client";\n"use strict"\nfoo();') })).toThrow(
      /use strict/
    );
  });
});

describe('realmVitePlugin：抖音', () => {
  it('入口带 use strict 时报错：非严格函数的 this 拿不到真实全局对象', () => {
    expect(() => generate('tt', { 'app.js': chunk('app.js', '"use strict";') })).toThrow(/use strict/);
    expect(() => generate('tt', { 'app.js': chunk('app.js', "\n  'use strict'\nfoo();") })).toThrow(/use strict/);
  });

  it('只认入口最前面的 use strict 指令：字符串字面量与函数体里的同名文本不算，照常登记', () => {
    const appCode = `var message="use strict";function helper(){'use strict';return message}`;
    const bundle: Bundle = { 'app.js': chunk('app.js', appCode) };
    const [realmModule] = generate('tt', bundle);
    if (!realmModule) throw new Error('没有发出登记模块');
    const app = (bundle['app.js'] as FakeChunk).code;

    expect(app.endsWith(appCode)).toBe(true);
    const { captured, realmGlobal } = runCapture(app, realmModule.source, false);
    expect(captured).toBe(realmGlobal);
  });

  it('入口用非严格函数的 this 登记', () => {
    expect(realmCaptureSource('tt')).toBe(`var ${REALM_BINDING}=function(){return this}();`);
  });
});

describe('realmVitePlugin：支付宝', () => {
  function appWithCapture(): { app: string; realmModule: string } {
    const bundle: Bundle = { 'app.js': chunk('app.js', '"use strict";') };
    const [realmModule] = generate('alipay', bundle);
    if (!realmModule) throw new Error('没有发出登记模块');
    return { app: (bundle['app.js'] as FakeChunk).code, realmModule: realmModule.source };
  }

  it('入口带 use strict 也行：Object.prototype getter 在严格模式下照样拿得到全局对象，登记语句插在指令之后', () => {
    expect(appWithCapture().app.startsWith(`"use strict";var ${REALM_BINDING}=`)).toBe(true);
  });

  it('环境有 globalThis（iOS 真机）就登记它', () => {
    const { app, realmModule } = appWithCapture();
    const { captured, realmGlobal } = runCapture(app, realmModule, false);

    expect(captured).toBe(realmGlobal);
  });

  it('模块作用域里 globalThis 是 undefined（模拟器）时经 Object.prototype getter 登记，读完删掉 getter', () => {
    const { app, realmModule } = appWithCapture();
    const { captured, realmGlobal, leftovers } = runCapture(app, realmModule, true);

    expect(captured).toBe(realmGlobal);
    expect(leftovers).toEqual([]);
  });

  it('登记到的不是真实全局对象时，登记模块报错', () => {
    const { realmModule } = appWithCapture();
    const app = `var ${REALM_BINDING}={};require("./${REALM_MODULE}").capture(${REALM_BINDING});`;

    expect(() => runCapture(app, realmModule, false)).toThrow(/真实全局对象/);
  });
});
