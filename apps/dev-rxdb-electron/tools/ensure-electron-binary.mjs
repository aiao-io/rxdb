/**
 * 触发 Electron 二进制的懒下载，失败按指数退避重试。
 *
 * Electron 42+ 不在 postinstall 下载二进制，改为首次 `require('electron')` 时下载
 * （`node_modules/electron/index.js` → `install.js` → `@electron/get`）。
 * electron-builder 读 `electronDist`（见 electron-builder.dir.json）之前必须先触发一次，
 * 否则 CI 新 runner / 新 clone 上 `dist/` 不存在，直接报 electronDist does not exist。
 *
 * 这一步原本是 project.json 里两处 `node -e "require('../../node_modules/electron')"`。
 * 换成脚本的理由：
 *
 * 1. 两个调用点（electron-build / electron-package-dir）与两个 workflow 共用同一份定义，
 *    与 `bundle-desktop-host.mjs`、`copy-app-manifest.mjs` 同源。
 * 2. **`@electron/get` 不重试。** 一次 DNS/TLS/连接重置就让整个 job 红在
 *    `TypeError: fetch failed` → `Electron failed to install correctly`，
 *    而这是一条约 100MB 的公网下载，在 CI 上必然偶发。下面的重试就是为它加的。
 *
 * 必须按**绝对路径**解析根级 `node_modules/electron`，而不是裸说明符：cwd 是
 * apps/dev-rxdb-electron 时裸 require 会解析到 app 级软链，一旦它与根级软链指向不同版本
 * （升级后 app 级链未刷新），懒下载会落到另一份拷贝，electron-builder 读到的
 * electronDist 仍然为空。
 *
 * 诊断信息一律写 stderr：调用方（CI 的 SUID 沙箱步骤）会用命令替换读 stdout 上的
 * 可执行文件路径，多一行就污染了。
 *
 * @module ensure-electron-binary
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronEntry = resolve(dirname(fileURLToPath(import.meta.url)), '../../../node_modules/electron');

/** 重试前的等待时长（毫秒），长度即为「除首次外还试几次」。 */
const backoffMs = [5_000, 20_000];

for (let attempt = 0; ; attempt += 1) {
  try {
    // 下载失败时 require 会抛，Node 不缓存抛错的模块，因此下一轮会真正重跑 install.js。
    console.error(`[ensure-electron-binary] ${require(electronEntry)}`);
    break;
  } catch (error) {
    if (attempt >= backoffMs.length) {
      throw error;
    }
    const waitMs = backoffMs[attempt];
    console.error(
      `[ensure-electron-binary] 第 ${attempt + 1} 次下载失败（${error instanceof Error ? error.message : error}），${waitMs / 1000}s 后重试`
    );
    await delay(waitMs);
  }
}
