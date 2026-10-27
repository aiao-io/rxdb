/**
 * `@subframe7536/sqlite-wasm` 没有为 Emscripten glue 提供类型，且只把它放在
 * `./dist/*` 通配导出下。文件名里的内容哈希与压缩后的导出名都会随版本变化，
 * 所以依赖必须锁在精确版本上，见 `subframe-glue.ts`。
 */
declare module '@subframe7536/sqlite-wasm/dist/wa-sqlite-DfKPyFeY.js' {
  /** rolldown 压缩后的导出名，指向 wa-sqlite 的 Emscripten 模块工厂。 */
  export const t: unknown;
}
