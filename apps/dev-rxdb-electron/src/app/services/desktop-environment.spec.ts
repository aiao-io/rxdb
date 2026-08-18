import { DESKTOP_HOST_TRANSPORT_KEY } from '@aiao/rxdb-adapter-electron';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDesktopHostRuntime } from './desktop-environment';

describe('isDesktopHostRuntime', () => {
  /**
   * 这一条同时是 US-207 E11 的**名字对齐**断言。
   *
   * @remarks
   * 被测模块里的键名是**抄**的字面量，不是 import 来的常量（理由见那边的 TSDoc：
   * import 会把 `DesktopSqliteClient` 拽进主 chunk）。这里用包里的真常量去构造探针的输入，
   * 两边一旦漂开这条就变红 —— 比直接比较两个字符串更贴近真实用法：真正要成立的是
   * 「preload 按包里的键注入，探针就能探到」。
   */
  it('preload 注入过桥接时为 true', () => {
    expect(
      isDesktopHostRuntime({ [DESKTOP_HOST_TRANSPORT_KEY]: { request: () => undefined, subscribe: () => undefined } })
    ).toBe(true);
  });

  it('浏览器预览（没有那把钥匙）时为 false', () => {
    expect(isDesktopHostRuntime({})).toBe(false);
  });

  it('探的是 RxDB 的桥接，不是 demo 自己的 window.electron', () => {
    expect(isDesktopHostRuntime({ electron: { ping: () => undefined } })).toBe(false);
  });

  it('非对象一律为 false，不抛错', () => {
    expect(isDesktopHostRuntime(undefined)).toBe(false);
    expect(isDesktopHostRuntime(null)).toBe(false);
    expect(isDesktopHostRuntime('window')).toBe(false);
  });

  /**
   * US-207 E11：本探针在主 chunk 里，它 import 谁，谁就跟着进 `main.js`。
   *
   * @remarks
   * 上面那条相等性断言保证名字不漂，这条保证名字**不是靠 import 得来的** ——
   * 少了它，把字面量改回 import 只会让相等性断言更加成立，而 bundle 悄悄胖回去。
   */
  it('不从适配器包 import，键名靠上面那条相等性断言钉住', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'desktop-environment.ts'), 'utf8');
    // 剥注释：被测模块的 TSDoc 里逐字解释着「不 import 适配器包」——
    // 那句说明理由的话不该把断言打红。
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^'"`\n]*?\/\/.*$/gm, '');

    expect(code).not.toContain('@aiao/rxdb-adapter-electron');
  });
});
