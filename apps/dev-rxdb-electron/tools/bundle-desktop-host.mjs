/**
 * ELEC-23：桌面 host bundle 的**唯一定义**。
 *
 * 主进程是逐文件 tsc 产物，而 electron-builder 的 `files` 白名单排除 node_modules ——
 * `@aiao/rxdb-adapter-desktop/host` 及其依赖只有被打进 `.bundle.js` 才跟得进产物。
 *
 * 这段配置此前以命令行形式在 project.json 里出现三次（electron-build /
 * electron-package-dir / watch-main）。三份逐字副本里漏改一处的后果不对称：
 * watch-main 漏改，`nx dev` 立刻起不来；打包那两处漏改，typecheck、单测、dev 全绿，
 * 只有真实产物在用户机器上启动时才 `Cannot find module`。所以收敛成一处。
 *
 * 路径全部从本文件位置推导，不依赖调用方的 cwd —— 三个调用点原本用的就是两套
 * 不同的相对路径基准。
 *
 * @module bundle-desktop-host
 */

import { build, context } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(appRoot, '../..');

/**
 * esbuild 配置。
 *
 * @remarks
 * 每个开关都对应一种真实的产物失败，少一个就少打包一层：
 * 没有 `bundle` 就只是转译；没有 `format: 'cjs'` 会 emit ESM，而应用 package.json
 * 没有 `"type": "module"`；没有 `platform: 'node'` 则 `node:sqlite` 之类的内建会被
 * 当成待打包的裸模块。`external: ['electron']` 是因为 electron 由运行时提供，
 * 打进来只会得到一个空壳。`target: 'node22'` 对齐 Electron 内置的 Node。
 *
 * 输出名带 `.bundle` 是**故意**的：tsc 照样会往 `desktop-host-bridge.js` 写它那份
 * 未打包的产物，同名就成了两个进程抢一个文件。
 *
 * 入口取**合流后的** `desktop-host-bridge.ts`（US-504）：SQLite 与文件两族 host 都要
 * 跟进产物，各打一份会把协议模块复制两遍，也会让 `main.ts` 维护两条 import 路径。
 *
 * 导出给 `desktop-sqlite-bridge.spec.ts` 断言——测试因此校验的是真正被用上的对象，
 * 而不是一段可能已经和实现脱节的命令行字符串。
 */
export const bundleOptions = {
  entryPoints: [resolve(appRoot, 'src-electron/desktop-host-bridge.ts')],
  outfile: resolve(workspaceRoot, 'dist/apps/dev-rxdb-electron/src-electron/desktop-host-bridge.bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info'
};

// 只有被当成脚本直接运行时才真的打包；被 spec import 时什么都不做。
if (import.meta.main) {
  if (process.argv.includes('--watch')) {
    // 与 `tsc --watch` 并行跑：两者输出文件名不同（.js vs .bundle.js），不会互相覆盖。
    const ctx = await context(bundleOptions);
    await ctx.watch();
  } else {
    await build(bundleOptions);
  }
}
