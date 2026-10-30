/**
 * @fileoverview 拒绝表：可行性矩阵判 `unsupported`、又写了宿主的平台，以及拒绝时要带出的判定依据。
 *
 * @remarks
 * 单独成模块，测试才能整表替换。表现在是空的：在真表上循环的用例一条断言都不执行，
 * 带原因的拒绝路径只能靠 `unsupported-platform-rejection.spec.ts` 换进一个演示条目来走。
 */

/** 可行性矩阵判 `unsupported` 的一个平台：报错要带出的判定依据。 */
export interface MiniProgramUnsupportedPlatform {
  /** 报错里的平台名。 */
  readonly displayName: string;
  /** 与矩阵 YAML 的 `blockers` 逐项一致。 */
  readonly blockers: readonly string[];
  /** 判定理由的一句话摘要，全文在矩阵对应章节。 */
  readonly reason: string;
  /** 矩阵里该平台章节的标题原文。 */
  readonly section: string;
}

/**
 * 可行性矩阵判 `unsupported` 的平台。它们不在 `MINI_PROGRAM_PLATFORM_IDS` 里，传入时抛
 * `MiniProgramUnsupportedPlatformError` 并带出判定依据；矩阵改判时两张表一起改，测试逐项核对。
 *
 * 包内共用，不从包入口导出。
 */
export const MINI_PROGRAM_UNSUPPORTED_PLATFORMS: Readonly<Record<string, MiniProgramUnsupportedPlatform>> =
  // 支付宝 2026-10-04 改判 supported 后为空；百度、QQ 门 1 就不过、没写 host，按未知平台拒绝
  Object.freeze({});
