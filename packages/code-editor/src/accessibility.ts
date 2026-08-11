/**
 * @fileoverview 计算写给 CodeMirror `contentDOM` 的无障碍属性，供三端共用。
 *
 * @remarks
 * 承担 `role="textbox"` 的不是各框架绑定的宿主元素，而是 CodeMirror 动态生成的
 * `.cm-content`。因此可访问名称（`aria-label` / `aria-labelledby`）、补充说明
 * （`aria-describedby`）与禁用语义（`aria-disabled`）都必须经
 * `EditorView.contentAttributes` 写到那个元素上 —— 只在宿主上补 `aria-*`
 * 等于把无障碍缺陷换个位置：屏幕阅读器进到 textbox 之后读到的仍然是一个
 * 没有名称、只报 `aria-readonly` 的多行文本框（CEA-008 / CER-006）。
 *
 * 属性的计算放核心包，理由与 {@link computeMinimalDocumentChange} 相同 ——
 * 「同一份逻辑在多个绑定间分叉」是本仓最高产的缺陷来源。三端只负责把自己的
 * input / prop 喂进来，再把结果塞进各自的 Compartment。
 *
 * @module accessibility
 */

/**
 * 计算内部 textbox 无障碍属性的输入。
 *
 * 字段刻意都可选：三端的 input / prop 默认值不同（Angular 的 `input<string>('')`、
 * React / Vue 的 `undefined`），在这里统一按「空即未设置」处理。
 */
export interface CodeEditorAccessibilityState {
  /** 描述性文本元素的 id，映射到 `aria-describedby`。 */
  readonly describedBy?: string;
  /** 编辑器当前是否处于**有效禁用**状态（`disabled` 与表单禁用汇合后的结果）。 */
  readonly disabled?: boolean;
  /** 可访问名称，映射到 `aria-label`。 */
  readonly label?: string;
  /** 承担标签的元素 id，映射到 `aria-labelledby`。 */
  readonly labelledBy?: string;
}

/**
 * 把无障碍状态转换成 `EditorView.contentAttributes` 的属性字典。
 *
 * @param state 当前的无障碍状态
 * @returns 只包含**确有取值**的属性；没有任何取值时返回空对象
 *
 * @remarks
 * 空串一律**不产出属性**，而不是产出一个空属性：`aria-label=""` 会让 textbox
 * 从「没有可访问名称」变成「可访问名称是空字符串」，某些屏幕阅读器就此不再回退到
 * `aria-labelledby` 或周边文本，可访问性反而更差。
 *
 * `aria-disabled` 只在禁用时出现。写 `aria-disabled="false"` 是合法的，但它与
 * CodeMirror 自己写出的 `aria-readonly` 叠在一起会让「只读」与「禁用」两种状态
 * 更难区分，因此未禁用时直接不写。
 *
 * 返回的是新对象，可以直接交给 `EditorView.contentAttributes.of(...)`。
 * CodeMirror 会把上一次的属性与本次做差量，多余的属性由它负责移除。
 *
 * @example
 * ```ts
 * const attributes = buildCodeEditorContentAttributes({ disabled: true, label: '代码输入' });
 * // { 'aria-disabled': 'true', 'aria-label': '代码输入' }
 * view.dispatch({ effects: a11yConf.reconfigure(EditorView.contentAttributes.of(attributes)) });
 * ```
 */
export const buildCodeEditorContentAttributes = (state: CodeEditorAccessibilityState): Record<string, string> => {
  const attributes: Record<string, string> = {};
  if (state.disabled) attributes['aria-disabled'] = 'true';
  if (state.describedBy) attributes['aria-describedby'] = state.describedBy;
  if (state.label) attributes['aria-label'] = state.label;
  if (state.labelledBy) attributes['aria-labelledby'] = state.labelledBy;
  return attributes;
};

/**
 * 判断初始化时是否应当执行 `autoFocus`。
 *
 * @param state 初始化时的禁用 / 只读状态
 * @returns 应当自动聚焦时为 `true`
 *
 * @remarks
 * `disabled` 与 `readonly` 都会把编辑器配成不可编辑（`EditorView.editable.of(false)`），
 * 此时把键盘焦点送进去，用户只会得到一个无法输入、也无从得知为什么无法输入的控件。
 * 这是**用户可见的行为修正**：此前 `autoFocus` 与 `disabled` 同时给出时编辑器照样抢焦点，
 * 甚至先于访问状态同步而抢到（CEA-008）。三端共用同一个判断以免再次分叉。
 */
export const shouldAutoFocusCodeEditor = (state: {
  readonly disabled?: boolean;
  readonly readonly?: boolean;
}): boolean => !state.disabled && !state.readonly;
