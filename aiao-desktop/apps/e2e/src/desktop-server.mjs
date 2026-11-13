import { resolve } from 'node:path';

import { contentTypes, startArtifactServer } from './fixtures/artifact-server.mjs';

export { contentTypes };

/**
 * web 的正式构建产物（`aiao-desktop-web:build`）。环境变量 `AIAO_DESKTOP_DIST` 或冒烟的 `--dist=` 参数
 * 可以指向另一份产物（例如固定提交上保存下来的构建，用来比较耗时或验证旧库升级）。
 */
export const outputRoot = resolve(
  process.env.AIAO_DESKTOP_DIST ?? resolve(import.meta.dirname, '../../../../dist/aiao-desktop/apps/web/browser')
);

/**
 * 只监听 127.0.0.1 的静态服务器托管桌面的正式构建，带跨源隔离所需的两个响应头（D-05）。
 * 返回它的来源与关闭函数。
 */
export function startDesktopServer({ root = outputRoot, port = 0 } = {}) {
  return startArtifactServer({ root, port });
}
