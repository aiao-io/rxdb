/**
 * 核心包内部实现的测试入口
 *
 * @remarks
 * R2-10 要证「组件入口转发的是真实核心源函数、rrweb 是核心解析到的同一模块」，拿的是核心包未导出的
 * 实现文件与它的私有依赖，没有包名可走。这些路径集中在这里**静态**再导出，spec 只动态取本地这一份：
 * spec 里直接 `import()` 跨项目路径会在 Nx 依赖图上留一条 dynamic 边，本包每一处
 * `@aiao/rxdb-plugin-replay` 的静态导入随即都被判成「静态导入懒加载库」。
 *
 * 不进库构建：`tsconfig.lib.json` 排除整个 `__tests__/`。
 */
/* eslint-disable @nx/enforce-module-boundaries -- 核心未导出的实现文件与私有依赖，见上 */
export { Replayer } from '../../../rxdb-plugin-replay/node_modules/rrweb/dist/rrweb.js';
export { mountReplayer } from '../../../rxdb-plugin-replay/src/replayer/mount-replayer.js';
export { replayRestoreHint } from '../../../rxdb-plugin-replay/src/restore.js';
/* eslint-enable @nx/enforce-module-boundaries */
