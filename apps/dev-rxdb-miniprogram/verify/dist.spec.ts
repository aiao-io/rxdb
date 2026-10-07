import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** US-219 AC#1～3、AC#5：`@aiao/rxdb-taro` 接入后微信、抖音产物的构建前提。 */

/** 默认断言本 demo；`VERIFY_DIST_APP_ROOT` 指向别的 Taro 项目时断言它的产物（US-219 AC#10 的 npm 安装路径）。 */
const APP_ROOT = process.env['VERIFY_DIST_APP_ROOT'] ?? fileURLToPath(new URL('..', import.meta.url));

const PLATFORM_OUTPUTS = { weapp: 'dist', tt: 'dist-tt' } as const;

const REALM_BINDING = '__rxdbRealm';

const REALM_MODULE = 'rxdb-realm.js';

const appRequire = createRequire(join(APP_ROOT, 'package.json'));
const adapterRequire = createRequire(appRequire.resolve('@aiao/rxdb-adapter-miniprogram/package.json'));
const wasm = readFileSync(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'));

function scriptsIn(outputRoot: string): Map<string, string> {
  const root = join(APP_ROOT, outputRoot);
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.js'));
  return new Map(files.map(file => [relative(root, join(root, file)), readFileSync(join(root, file), 'utf8')]));
}

describe.each(Object.entries(PLATFORM_OUTPUTS))('%s 产物（%s/）', (_platform, outputRoot) => {
  const scripts = scriptsIn(outputRoot);

  it('wasm 在产物根的 wa-sqlite/，字节与 adapter 依赖的 wasm 相同', () => {
    expect(readFileSync(join(APP_ROOT, outputRoot, 'wa-sqlite/wa-sqlite.wasm')).equals(wasm)).toBe(true);
    expect(existsSync(join(APP_ROOT, outputRoot, 'dist'))).toBe(false);
  });

  it('脚本里没有 import.meta，也没有 wasm 的 base64 内联', () => {
    const offenders = [...scripts].filter(
      ([, code]) => code.includes('import.meta') || /AGFzbQ[\w+/=]{1000,}/.test(code)
    );

    expect(scripts.size).toBeGreaterThan(0);
    expect(offenders.map(([file]) => file)).toEqual([]);
  });
});

describe('抖音产物绑定真实全局对象', () => {
  const scripts = scriptsIn(PLATFORM_OUTPUTS.tt);

  it('入口 app.js 最前面用非严格函数的 this 登记 realm', () => {
    expect(scripts.get('app.js')).toMatch(
      new RegExp(
        `^var ${REALM_BINDING}=function\\(\\)\\{return this\\}\\(\\);require\\("\\./${REALM_MODULE}"\\)\\.capture\\(${REALM_BINDING}\\);`
      )
    );
    expect(scripts.has(REALM_MODULE)).toBe(true);
  });

  it('其余用到绑定的 chunk 开头从登记模块取', () => {
    const users = [...scripts].filter(([file, code]) => file !== 'app.js' && code.includes(REALM_BINDING));

    expect(users.length).toBeGreaterThan(0);
    for (const [, code] of users) {
      expect(code).toMatch(
        new RegExp(
          `^(?:"use strict";)?var ${REALM_BINDING}=require\\("(?:\\.\\./)*\\.?/?${REALM_MODULE}"\\)\\.realm\\(\\);`
        )
      );
    }
  });

  it('除登记模块外没有自由的 globalThis', () => {
    const offenders = [...scripts].filter(
      ([file, code]) => file !== REALM_MODULE && /(?<![.\w$"'])globalThis(?![\w$])/.test(code)
    );

    expect(offenders.map(([file]) => file)).toEqual([]);
  });
});

/**
 * US-219 AC#14/15：运行时入口只留本平台分支。只判对平台全局的自由引用：宿主工厂里的字符串（`"TTWebAssembly"`）不会触发
 * ReferenceError；裸 `tt.` / `wx.` 也不判，压缩器会把局部变量命名成 `tt`、`wx`。
 */
const PLATFORM_GLOBALS = {
  weapp: { own: ['wx', 'WXWebAssembly'], other: ['tt', 'TTWebAssembly'] },
  tt: { own: ['tt', 'TTWebAssembly'], other: ['wx', 'WXWebAssembly'] }
} as const;

/** `typeof 全局` 与长标识符的自由引用（前后不贴标识符字符、`.` 与引号）。 */
function freeReferences([shortName, wasmRuntime]: readonly [string, string]): RegExp {
  return new RegExp(`typeof ${shortName}(?![\\w$])|(?<![\\w$.'"\`])${wasmRuntime}(?![\\w$'"\`])`);
}

describe.each(Object.entries(PLATFORM_GLOBALS))('%s 产物只引用本平台的全局', (platform, globals) => {
  const scripts = scriptsIn(PLATFORM_OUTPUTS[platform as keyof typeof PLATFORM_OUTPUTS]);
  const filesMatching = (pattern: RegExp) =>
    [...scripts].filter(([, code]) => pattern.test(code)).map(([file]) => file);

  it('有本平台全局的引用', () => {
    expect(filesMatching(freeReferences(globals.own))).not.toEqual([]);
  });

  it('没有另一平台全局的自由引用', () => {
    expect(filesMatching(freeReferences(globals.other))).toEqual([]);
  });
});
