/**
 * @fileoverview 载入 `@subframe7536/sqlite-wasm` 1.4.0 的同步 wa-sqlite Emscripten glue。
 *
 * 该包只经 `./dist/*` 通配导出暴露 glue，文件名带 rolldown 的内容哈希、导出名被压缩成
 * `t`，两者都会随版本变化，因此 `package.json` 里必须锁精确版本而不是 `^`。
 *
 * 上游 glue 需要一处 Global 缺失回退才能跑在 iOS 微信上，而 workspace patch 不随包发布，
 * 所以补丁后的 glue 固化在 `src/vendor/` 里随 adapter 一起打包（详见 vendor 文件头部说明），
 * 这里 import 的是固化副本；`@subframe7536/sqlite-wasm` 的 npm 依赖只再提供 wasm 二进制。
 */
import type { WaSqliteModuleFactory } from './mini-program.interface.js';

/** `@subframe7536/sqlite-wasm` 暴露 wasm 二进制的公共子路径，供打包器复制进代码包。 */
export const SUBFRAME_WASM_SUBPATH = '@subframe7536/sqlite-wasm/wasm';

/**
 * 载入 `@subframe7536/sqlite-wasm` 1.4.0 的同步 wa-sqlite 模块工厂（固化副本）。
 *
 * 该构建开启了 `ENABLE_FTS5`，所以小程序侧也能建 FTS5 虚拟表。返回的工厂必须与同一个包的
 * {@link SUBFRAME_WASM_SUBPATH} 配对使用 —— glue 与 wasm 是一对，跨构建混用会 `LinkError`。
 *
 * @throws 当 glue 未导出模块工厂时抛出，通常意味着依赖版本漂移。
 */
export async function loadSubframeModuleFactory(): Promise<WaSqliteModuleFactory> {
  const glue = await import('./vendor/wa-sqlite-bT14NS4h.js');
  if (typeof glue.t !== 'function') {
    throw new Error('@subframe7536/sqlite-wasm 固化 glue 未导出 wa-sqlite 模块工厂，请确认依赖锁在 1.4.0');
  }
  return glue.t as WaSqliteModuleFactory;
}
