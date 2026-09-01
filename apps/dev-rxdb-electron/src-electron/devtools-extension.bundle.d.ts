/**
 * @fileoverview `devtools-extension.bundle.js` 的类型 —— 那份 JS 由 esbuild 生成，仓库里不存在。
 *
 * @remarks
 * 打包产物与源码导出面逐字相同，因此这里直接转发源码的类型。理由与
 * `desktop-host-bridge.bundle.d.ts` 一致：`main.ts` 必须 import 打包后的那份（ELEC-23），
 * 而 tsc 认不出一个尚不存在的 `.js`。声明文件不产生 emit，不会与 esbuild 抢输出路径。
 *
 * @module devtools-extension.bundle
 */

export * from './devtools-extension.js';
