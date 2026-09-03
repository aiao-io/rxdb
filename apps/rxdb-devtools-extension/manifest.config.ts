// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./src/vite-env.d.ts" />
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'RxDB DevTools',
  description: '检查 RxDB 本地优先数据库：实时事件流、实体数据、分支、OPFS 文件与存储管理。',
  version: pkg.version,
  icons: {
    16: 'public/icon-16.png',
    32: 'public/icon-32.png',
    48: 'public/icon-48.png',
    128: 'public/icon-128.png'
  },
  devtools_page: 'devtools.html',
  permissions: ['scripting'],
  // US-904 阶段 D 实测：**不要**为 Electron 往这里加 `host_permissions`。
  // 桌面应用生产入口是自定义 `app:` scheme，而自定义 scheme 不在 Chromium 扩展
  // match pattern 的合法 scheme 集里 —— `app://-/*`、`<all_urls>`、两者并列三种写法
  // 都实测无效，`chrome.scripting` 一律抛
  // 「Cannot access contents of the page. Extension manifest must request permission...」。
  // Electron 侧要跑通四段 relay，唯一成立的形态是 inspected page 本身走 http（`--serve`），
  // 且由**开发专用**的 manifest 副本提供一条窄的静态 host permission（Electron 没有
  // `chrome.permissions` 命名空间，optional 权限永远授不出去）。生产 manifest 保持
  // optional-only，见 US-904 阶段 A 记录的可容忍差异。
  optional_host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  }
});
