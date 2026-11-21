// esbuild 注入文件（见 build-edge.mjs）：pg 等 npm 包把 Buffer、process、setImmediate 当全局变量使用，
// Deno（Supabase Edge Function）的用户代码里没有这几个全局变量。这里从 node 兼容模块显式导入，
// 产物里对它们的引用都改指这里，Node 与 Deno 运行同一份产物。
export { Buffer } from 'node:buffer';
export { default as process } from 'node:process';
export { clearImmediate, setImmediate } from 'node:timers';
