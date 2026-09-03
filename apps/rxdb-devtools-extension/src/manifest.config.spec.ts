import type { ConfigEnv } from 'vite';
import { describe, expect, it } from 'vitest';
import resolveManifest, { createManifest, DESKTOP_DEV_HOST_PERMISSIONS, DESKTOP_DEV_MODE } from '../manifest.config';

/** 构造一次 vite `ConfigEnv`；只有 `mode` 参与变体判定。 */
const env = (mode: string): ConfigEnv => ({ command: 'build', mode, isPreview: false, isSsrBuild: false });

describe('extension permissions', () => {
  it('uses optional host access and does not require webNavigation', () => {
    expect(createManifest('default')).toMatchObject({
      permissions: ['scripting'],
      optional_host_permissions: ['<all_urls>']
    });
  });

  // US-904 阶段 D 实测（打包产物 + 真实扩展 + 真实 DevTools，见故事里的 AC#52 交付记录）：
  // 桌面应用的生产入口是自定义 `app:` scheme，而自定义 scheme **不在** Chromium 扩展
  // match pattern 的合法 scheme 集里。三种写法对照，`chrome.scripting.executeScript`
  // 全部抛同一句「Cannot access contents of the page…」：
  //
  //   host_permissions: ['app://-/*']              → 失败
  //   host_permissions: ['<all_urls>']             → 失败（它只覆盖 http/https/file/ftp）
  //   host_permissions: ['app://*/*', '<all_urls>'] → 失败
  //
  // 同一次对照里把 renderer 换成 `http://localhost:<port>`（应用的 `--serve` 路径）并给一条
  // 静态 `http://localhost/*`，四段 relay **2.6 秒**接通、面板显示「已连接 / 23 事件」。
  //
  // 所以这里锁的是一条否定契约：不要为了「让 Electron 能用」往生产 manifest 里加 host_permissions
  // —— 加了也不工作，只会让浏览器侧多一份安装警告与权限面。Electron 的授权缺口
  //（没有 `chrome.permissions` 命名空间，optional 权限永远授不出去）由 US-906 的
  // dev-only 构建变体承担，属阶段 A 已记录的可容忍差异。
  //
  // 断言的是 `createManifest('default')` 而不是默认导出：默认导出是按 mode 分支的**函数**，
  // 在它身上读 `.host_permissions` 恒为 undefined，负契约会静默失效变成假绿。
  it('keeps host access optional-only: no static host_permissions in the shipped manifest', () => {
    expect(createManifest('default').host_permissions).toBeUndefined();
  });

  // 同上：`web_accessible_resources` 也不要为 `app://` 显式声明。
  // background 注入的是 crxjs 的 loader，loader 体内 `import(chrome.runtime.getURL(...))`
  // 要求该资源对被检查页 origin 可访问；crxjs 默认给 `http://*/*` + `https://*/*`，
  // 正好覆盖唯一能工作的 Electron 形态。写死一份只会把默认值覆盖掉，多担一份维护。
  it('leaves dynamic-resource matches to the crxjs default', () => {
    expect(createManifest('default').web_accessible_resources).toBeUndefined();
  });
});

describe('desktop dev variant (US-906 AC#1)', () => {
  // Electron 没有 `chrome.permissions` 命名空间，optional 权限的授权集恒为空，所以桌面端
  // 必须有一条**静态** host permission。pattern 不含端口 —— Chrome 的 host pattern 本就不匹配
  // 端口，`nx serve` 的 4120 与 e2e 里的随机端口都覆盖得到。
  it('grants a static localhost host permission', () => {
    expect(createManifest(DESKTOP_DEV_MODE).host_permissions).toEqual(DESKTOP_DEV_HOST_PERMISSIONS);
    expect(DESKTOP_DEV_HOST_PERMISSIONS).toEqual(['http://localhost/*']);
  });

  // 变体只加那一条权限，**别的什么都不许改**。少了这条断言，dev 变体会慢慢长成第二个扩展：
  // 改了 name / background / devtools_page 之后，开发者在桌面端调的就不再是将要发布的那个东西，
  // 而「桌面端跑得通、浏览器端跑不通」这类问题会被归因到宿主差异上。
  it('differs from the shipped manifest by exactly that one key', () => {
    const shipped: Record<string, unknown> = { ...createManifest('default') };
    const dev: Record<string, unknown> = { ...createManifest(DESKTOP_DEV_MODE) };
    delete dev['host_permissions'];
    expect(dev).toEqual(shipped);
  });
});

describe('manifest variant resolution', () => {
  // 默认导出是 crxjs 的 `ManifestV3Fn`（`defineManifest` 是恒等函数）。这里直接调它，
  // 验的是「哪个 mode 拿到哪份 manifest」—— vite.config 与 project.json 之间靠的就是这个约定。
  const resolve = resolveManifest as (input: ConfigEnv) => ReturnType<typeof createManifest>;

  it('serves the dev variant only under the desktop-dev mode', () => {
    expect(resolve(env(DESKTOP_DEV_MODE)).host_permissions).toEqual(DESKTOP_DEV_HOST_PERMISSIONS);
  });

  it.each(['production', 'development', 'desktop', 'desktop-dev-extra'])(
    'serves the shipped manifest under mode %s',
    mode => {
      expect(resolve(env(mode)).host_permissions).toBeUndefined();
    }
  );
});
