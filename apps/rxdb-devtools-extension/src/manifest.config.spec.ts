import { describe, expect, it } from 'vitest';
import manifest from '../manifest.config';

describe('extension permissions', () => {
  it('uses optional host access and does not require webNavigation', () => {
    expect(manifest).toMatchObject({
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
  //（没有 `chrome.permissions` 命名空间，optional 权限永远授不出去）由开发专用的 manifest
  // 副本承担，属阶段 A 已记录的可容忍差异。
  it('keeps host access optional-only: no static host_permissions in the shipped manifest', () => {
    expect(manifest.host_permissions).toBeUndefined();
  });

  // 同上：`web_accessible_resources` 也不要为 `app://` 显式声明。
  // background 注入的是 crxjs 的 loader，loader 体内 `import(chrome.runtime.getURL(...))`
  // 要求该资源对被检查页 origin 可访问；crxjs 默认给 `http://*/*` + `https://*/*`，
  // 正好覆盖唯一能工作的 Electron 形态。写死一份只会把默认值覆盖掉，多担一份维护。
  it('leaves dynamic-resource matches to the crxjs default', () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});
