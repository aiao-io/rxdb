/**
 * 把应用的 `package.json` 复制进 tsc 产物目录，供 electron-builder 读取。
 *
 * electron-builder 从 `directories.app` 指向的目录里读 `package.json`（`main` 入口、
 * `name`、`version`），而那个目录是 tsc 的输出目录 —— tsc 只写 `.js`，不会把清单带过去。
 *
 * 这一步原本是 `cp package.json ../../dist/apps/dev-rxdb-electron/`，在 project.json 里
 * 出现两次（electron-build / electron-package-dir）。换成脚本有两个理由，第二个才是关键：
 *
 * 1. 两个调用点共用同一份定义，与 `bundle-desktop-host.mjs` 同源。
 * 2. **`cp` 在 Windows 上不存在。** nx 的 `run-commands` 在 Windows 上走 `cmd.exe`，
 *    这条命令会以 `'cp' is not recognized...` 失败。今天没人发现，是因为
 *    `ci-windows.yml` 不跑这两个 target；US-207 AC#8 的三平台打包一上，
 *    它就是必然发生的第一个红。
 *
 * 路径从本文件位置推导，不依赖调用方的 cwd。
 *
 * @module copy-app-manifest
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(appRoot, '../../dist/apps/dev-rxdb-electron');

// 目标目录正常情况下已由 tsc 建好；`recursive` 是为了让单独跑本脚本时也不会因目录缺失而炸。
mkdirSync(outputDir, { recursive: true });
copyFileSync(join(appRoot, 'package.json'), join(outputDir, 'package.json'));
