/**
 * 把保持 external 的运行时依赖搬进产物目录，供 electron-builder 打包。
 *
 * 目前只有一个：`@electric-sql/pglite`（US-208 的 PGlite worker 用）。
 *
 * 它为什么不能像别的依赖那样被 esbuild 打进 bundle：PGlite 按模块自身位置去找
 * `initdb.wasm` / `pglite.data` / contrib 的 `.tar.gz`。打进 bundle 后模块位置变了，
 * 那些相对定位全部落空——构建照样成功，只有运行时才报找不到 wasm。
 *
 * 它为什么需要这一步：`directories.app` 指向的是 tsc 的输出目录，那里没有 node_modules；
 * 而 `files` 白名单的第一条是 `!node_modules`。两件事合起来的结果是「external 的东西
 * 一个都进不了产物」。所以先把它复制成产物目录下真实的 `node_modules/<name>`，
 * 再由 electron-builder.json 里那条 re-include 放行。
 *
 * `dereference: true` 是 pnpm 下的硬要求：工作区里 `node_modules/@electric-sql/pglite`
 * 是一条指向 `.pnpm` store 的软链，照搬过去就是一条指向用户机器上某个路径的死链。
 *
 * 路径从本文件位置推导，不依赖调用方的 cwd。
 *
 * @module stage-external-dependencies
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(appRoot, '../..');
const outputModules = resolve(workspaceRoot, 'dist/apps/dev-rxdb-electron/node_modules');

/** 需要原样搬进产物的包，键即 `node_modules` 下的相对路径。 */
export const externalPackages = ['@electric-sql/pglite'];

for (const name of externalPackages) {
  const target = join(outputModules, name);
  // 先删再拷：pnpm 换版本后 `dist/` 里那份不会自己更新，留着就是一份越来越旧的副本。
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(workspaceRoot, 'node_modules', name), target, { recursive: true, dereference: true });
}
