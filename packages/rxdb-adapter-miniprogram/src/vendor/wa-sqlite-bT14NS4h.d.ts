/**
 * `@subframe7536/sqlite-wasm@1.4.0` 同步 glue 的固化副本类型声明。
 *
 * 上游没有为 Emscripten glue 提供类型，只把它放在 `./dist/*` 通配导出下。固化副本打过
 * iOS WXWebAssembly 的 Global 缺失回退（见同目录 `.js` 文件头部说明），导出名被 rolldown
 * 压缩成 `t`，指向 wa-sqlite 的 Emscripten 模块工厂。
 */
export const t: unknown;
