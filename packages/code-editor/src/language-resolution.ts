/**
 * @fileoverview 把「language 名 + 候选列表」解析成一个可比较的结果，供三端判断是否需要重配置语言。
 *
 * @remarks
 * 三个框架绑定都要在 `language` / `languages` 变化时决定「要不要重新 `load()` 并
 * reconfigure 语言 Compartment」。早先三端一致地把**容器 identity**当作判定基准：
 * Angular 看 `SimpleChanges['languages']`、Vue 看 `watch` 的数组引用、React 看 effect
 * 依赖里的数组。父组件写 `[languages]="[myLang]"` 这类内联字面量时每轮都是新数组，
 * 于是每轮都重新构造 parser、整篇重新词法分析；自定义异步 loader 还会多发请求
 * 并让竞态代号空转（CEA-006 / CEV-003）。
 *
 * 正确的基准是**当前语言实际解析到的 description identity**：
 * 换了容器但选中的还是同一个 description，就没有任何工作要做。
 *
 * 解析逻辑放在核心包，理由与 {@link computeMinimalDocumentChange} 相同 ——
 * 「同一份逻辑在多个绑定间分叉」是本仓最高产的缺陷来源。
 *
 * @module language-resolution
 */
import type { CodeEditorLanguageDescription } from './languages.js';
import { findLanguageByName } from './languages.js';

/**
 * 一次语言解析的结果。
 *
 * 三个分支对应编辑器的三种处置：装上语言扩展（`found`）、清空语言扩展（`none`）、
 * 清空并报告配置错误（`not-found`）。刻意用可辨识联合而不是
 * `CodeEditorLanguageDescription | null` —— 后者把「明确不高亮」和「配置写错了」
 * 压成同一个值，调用方无从区分该不该报错。
 */
export type ResolvedCodeEditorLanguage =
  | {
      /** 明确不需要语法高亮：语言名为空、为 `'plaintext'`，或候选列表为空。 */
      readonly kind: 'none';
    }
  | {
      /** 语言名在候选列表里找不到 —— 属配置错误，调用方应向宿主报告。 */
      readonly kind: 'not-found';
      /** 未能解析的语言名，原样保留大小写以便出现在错误信息里。 */
      readonly name: string;
    }
  | {
      /** 解析成功。 */
      readonly kind: 'found';
      /** 命中的语言描述；`load()` 由调用方按自己的竞态规则发起。 */
      readonly description: CodeEditorLanguageDescription;
    };

/** 常量化的 `none`，让「两次都解析为不高亮」在引用比较下也成立。 */
const NONE: ResolvedCodeEditorLanguage = Object.freeze({ kind: 'none' });

/**
 * 解析当前应当使用的语言描述。
 *
 * @param name 语言名或别名；空串与 `'plaintext'` 表示不高亮
 * @param languages 候选语言列表；空列表表示不高亮
 * @returns 可辨识的解析结果，见 {@link ResolvedCodeEditorLanguage}
 *
 * @remarks
 * 纯函数，不打日志也不抛错：「找不到」是返回值的一个分支，由调用方决定怎么报告 ——
 * 三端对错误通道的表达方式不同（output / callback prop / emit），
 * 把 `console.error` 写死在这里就没法统一。
 *
 * @example
 * ```ts
 * resolveCodeEditorLanguage('ts', SUPPORT_LANGUAGES);   // { kind: 'found', description: … }
 * resolveCodeEditorLanguage('plaintext', SUPPORT_LANGUAGES); // { kind: 'none' }
 * resolveCodeEditorLanguage('nope', SUPPORT_LANGUAGES); // { kind: 'not-found', name: 'nope' }
 * ```
 */
export const resolveCodeEditorLanguage = (
  name: string,
  languages: readonly CodeEditorLanguageDescription[]
): ResolvedCodeEditorLanguage => {
  if (!name || name === 'plaintext' || languages.length === 0) return NONE;

  const description = findLanguageByName(name, languages);
  if (!description) return { kind: 'not-found', name };

  return { kind: 'found', description };
};

/**
 * 判断两次解析结果是否等价 —— 等价即「无需重新加载或重配置语言」。
 *
 * @param left 上一次已生效的解析结果；`undefined` 表示还没解析过
 * @param right 本次的解析结果
 * @returns 两者等价时为 `true`
 *
 * @remarks
 * `found` 分支**只比 description 的引用**，不比语言名：`'TypeScript'` 改成别名 `'ts'`
 * 解析到的是同一个描述，重新构造 parser 纯属浪费。
 *
 * `not-found` 分支比语言名：从一个错名换到另一个错名要重新报告错误，
 * 否则宿主只会看到第一次的配置错误。
 *
 * 注意本函数**不**判断「要不要强制重载」。调用方若需要强制重载
 * （例如宿主换掉了同名描述背后的 loader 实现），应当调用各端的显式命令式方法，
 * 而不是靠传一个等价的新数组制造隐式副作用。
 */
export const isSameResolvedLanguage = (
  left: ResolvedCodeEditorLanguage | undefined,
  right: ResolvedCodeEditorLanguage
): boolean => {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === 'found' && right.kind === 'found') return left.description === right.description;
  if (left.kind === 'not-found' && right.kind === 'not-found') return left.name === right.name;
  return true;
};
