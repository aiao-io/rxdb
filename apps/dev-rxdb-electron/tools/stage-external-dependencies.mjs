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
 * 光有这一步还不够，**每个 externalPackages 成员都必须同时是应用 `package.json` 的
 * `dependencies`**（不是 devDependencies）。electron-builder 26 收集 node_modules 时
 * 只走生产依赖图：依次在 `[directories.app, projectDir, workspaceRoot]` 里找清单，
 * pnpm collector 跑 `pnpm list --prod`，兜底的 traversal collector 只读
 * `dependencies` + `optionalDependencies`。放在 devDependencies 里，这里拷进去的目录
 * 会被判成「不属于任何生产依赖」而整个跳过。
 *
 * 这个坑长期只在 Windows 上现形：`findWorkspaceRoot` 靠 `pnpm --workspace-root exec pwd`
 * 定位工作区根，那条命令在 Windows 上拿不到可用路径，搜索目录退化成只剩产物目录本身，
 * 于是收集结果为空、产物里根本没有 PGlite；macOS / Linux 则因为能解析到工作区根、
 * 收下整棵根生产依赖图再被 `files` 白名单裁到只剩 PGlite，侥幸一直是绿的。
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

// 只有被当成脚本直接运行时才真的搬运；被 spec import 时只取 externalPackages。
if (import.meta.main) {
  for (const name of externalPackages) {
    const target = join(outputModules, name);
    // 先删再拷：pnpm 换版本后 `dist/` 里那份不会自己更新，留着就是一份越来越旧的副本。
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(workspaceRoot, 'node_modules', name), target, { recursive: true, dereference: true });
  }
}
