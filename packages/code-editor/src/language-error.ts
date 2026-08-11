/**
 * @fileoverview 语言解析 / 加载失败的结构化载荷，供三端用各自的事件通道报告给宿主。
 *
 * @remarks
 * 三个框架绑定原先都只在语言找不到或 `load()` rejected 时打一条 `console.error`，
 * 然后静默降级为纯文本。对宿主应用而言这条路径**完全不可观测**：拿不到错误、
 * 没有重试或降级的机会，用户只看到高亮突然消失（CEA-007 / CER-004 / CEV-004）。
 *
 * 载荷形状定义在核心包，理由与 {@link resolveCodeEditorLanguage} /
 * `computeMinimalDocumentChange` 相同 —— 三端只负责把它送进各自的通道
 * （Angular `output` / React callback prop / Vue `emit`），
 * 「同一份语义在多个绑定间分叉」是本仓最高产的缺陷来源。
 *
 * 降级策略本身不变：出错仍然清空语言 Compartment 退回纯文本。
 * 结构化事件是**新增的**观测通道，不是替换品，因此对既有消费者完全向后兼容。
 *
 * @module language-error
 */

/**
 * 语言失败的类别。
 *
 * - `not-found`：语言名在候选列表里查不到 —— 属**配置错误**，宿主应当修配置。
 * - `load-failed`：语言查到了但 `load()` rejected —— 通常是**网络或分包问题**，宿主可以重试。
 *
 * 刻意分成两类：前者重试没有意义，后者重试往往就能恢复。
 */
export type CodeEditorLanguageErrorKind = 'not-found' | 'load-failed';

/** 一次语言失败的结构化描述。 */
export interface CodeEditorLanguageError {
  /** 失败类别，见 {@link CodeEditorLanguageErrorKind}。 */
  readonly kind: CodeEditorLanguageErrorKind;
  /** 触发失败的语言名，原样保留大小写以便直接回显给用户。 */
  readonly language: string;
  /** 稳定的可读描述，三端同文案；不适合直接展示给终端用户，仅供日志与调试。 */
  readonly message: string;
  /** `load-failed` 时为 loader 的 rejection 值（任意类型）；`not-found` 时为 `undefined`。 */
  readonly cause: unknown;
}

/**
 * 构造「语言名查不到」的错误载荷。
 *
 * @param language 未能解析的语言名
 * @returns `kind` 为 `'not-found'` 的载荷，`cause` 为 `undefined`
 */
export const codeEditorLanguageNotFound = (language: string): CodeEditorLanguageError =>
  Object.freeze({
    kind: 'not-found',
    language,
    message: `Language '${language}' not found.`,
    cause: undefined
  });

/**
 * 构造「语言加载失败」的错误载荷。
 *
 * @param language 加载失败的语言名
 * @param cause loader 的 rejection 值，原样透传 —— 不做 `Error` 包装，
 *   否则宿主拿不到原始的网络错误码或 chunk 加载错误
 * @returns `kind` 为 `'load-failed'` 的载荷
 */
export const codeEditorLanguageLoadFailed = (language: string, cause: unknown): CodeEditorLanguageError =>
  Object.freeze({
    kind: 'load-failed',
    language,
    message: `Failed to load language '${language}'.`,
    cause
  });
