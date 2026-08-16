/**
 * @fileoverview `desktop-host-bridge.bundle.js` 的类型 —— 那份 JS 由 esbuild 生成，仓库里不存在。
 *
 * @remarks
 * 打包产物与源码导出面逐字相同，因此这里直接转发源码的类型。
 * 之所以需要这么一个文件：`main.ts` 必须 import 打包后的那份（理由见
 * `desktop-sqlite-bridge.spec.ts` 的 ELEC-23），而 tsc 认不出一个尚不存在的 `.js`。
 *
 * 转发的是**合流入口**：SQLite 与文件两族 host 都要跟进产物，各打一份会把
 * 协议模块复制两遍，也会让 `main.ts` 需要维护两条 import 路径。
 *
 * 声明文件不产生 emit，因此不会与 esbuild 抢输出路径。
 *
 * @module desktop-host-bridge.bundle
 */

export * from './desktop-host-bridge.js';
