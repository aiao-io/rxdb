// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./src/vite-env.d.ts" />
import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

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
  optional_host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  }
});
