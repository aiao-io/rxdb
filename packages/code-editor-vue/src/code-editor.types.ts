import type { CodeEditorLanguageDescription, CodeEditorLanguageError, CodeEditorTheme } from '@aiao/code-editor';
import type { EditorView } from '@codemirror/view';

/** CodeMirror 预置扩展集合。 */
export type CodeEditorSetup = 'basic' | 'minimal' | null;

/**
 * Vue CodeEditor 的公开属性。
 *
 * @remarks 与 Angular 的 inputs、React 的 props 同名同义；仅初始化生效的两项
 * （{@link CodeEditorProps.autoFocus} / {@link CodeEditorProps.root}）在各自条目上标注。
 */
export interface CodeEditorProps {
  /**
   * 挂载后立即聚焦编辑器。
   *
   * @defaultValue false
   * @remarks **仅挂载时读取一次**，后续变更被忽略。`disabled` 或 `readonly` 为真时
   * 不抢焦点 —— 否则用户得到一个无法输入、也无从得知为什么无法输入的控件。
   */
  readonly autoFocus?: boolean;
  /**
   * 补充说明元素的 id，写成内部 textbox 的 `aria-describedby`。
   *
   * @remarks 属性落在 CodeMirror 的 `.cm-content` 上 —— 承担 `role="textbox"` 的是它，
   * 不是组件的宿主元素。空串按「未设置」处理。三端同名同义。
   */
  readonly describedBy?: string;
  /**
   * 禁用：只读且不可编辑，并向辅助技术报告 `aria-disabled`。
   *
   * @defaultValue false
   * @remarks 与 `readonly` 是独立的两个属性，任一为真都会让编辑器不可编辑；
   * 区别在于禁用还会写出 `aria-disabled` 并抑制 `autoFocus`。
   */
  readonly disabled?: boolean;
  /**
   * 显示空白字符。
   *
   * @defaultValue false
   */
  readonly highlightWhitespace?: boolean;
  /**
   * 一级缩进使用的字符串。
   *
   * @defaultValue '  '（两个空格，三端一致）
   */
  readonly indentUnit?: string;
  /**
   * 允许 Tab 键缩进。
   *
   * @defaultValue false
   * @remarks 打开后 Tab 不再移动焦点，键盘用户会被困在编辑器里 —— 这是可达性取舍，
   * 三端默认一致地关闭。
   */
  readonly indentWithTab?: boolean;
  /**
   * 语法高亮语言名或别名；`''` 与 `'plaintext'` 表示不高亮。
   *
   * @defaultValue 'sql'
   * @remarks 查不到或 `load()` 失败时**降级为纯文本**并继续可用，同时发出
   * `language-error` 事件（见 {@link CodeEditorEmits}）。快速切换时只有最后一次请求生效。
   */
  readonly language?: string;
  /**
   * 候选语言列表；空列表表示不高亮。
   *
   * @defaultValue SUPPORT_LANGUAGES
   * @remarks 传内联字面量（`:languages="[myLang]"`）是有成本的：每轮更新都是新数组，
   * 而 `watch` 按引用触发。组件会再判断当前语言解析到的 description 是否真的换了 ——
   * 只有真换了才重新 `load()`，但这层判断本身仍要跑，稳定引用（模块级常量或 `computed`）更省。
   */
  readonly languages?: readonly CodeEditorLanguageDescription[];
  /**
   * 可访问名称，写成内部 textbox 的 `aria-label`。
   *
   * @remarks 落点与 {@link CodeEditorProps.describedBy} 相同。
   */
  readonly label?: string;
  /**
   * 承担标签的元素 id，写成内部 textbox 的 `aria-labelledby`。
   *
   * @remarks 落点与 {@link CodeEditorProps.describedBy} 相同。
   */
  readonly labelledBy?: string;
  /**
   * 自动换行。
   *
   * @defaultValue false
   */
  readonly lineWrapping?: boolean;
  /**
   * 空文档时显示的占位文本。
   *
   * @defaultValue ''
   */
  readonly placeholder?: string;
  /**
   * 只读：仍可聚焦、可选择、可复制，但不能改。
   *
   * @defaultValue false
   * @remarks 只挡编辑**命令**，不挡宿主同步 —— `value` 变化照样写进文档，
   * 否则只读的受控用法直接失效。
   */
  readonly readonly?: boolean;
  /**
   * CodeMirror 挂载的 DOM 根，用于 Shadow DOM 场景。
   *
   * @remarks **仅挂载时读取一次** —— CodeMirror 无法在构造后改 root。
   * 需要换 root 时请用 `v-if` 或 `:key` 强制重建组件。
   */
  readonly root?: Document | ShadowRoot;
  /**
   * CodeMirror 预设扩展集；`null` 表示不加载任何预设。
   *
   * @defaultValue 'basic'
   */
  readonly setup?: CodeEditorSetup;
  /**
   * 主题。
   *
   * @defaultValue 'light'
   */
  readonly theme?: CodeEditorTheme;
  /**
   * 文档内容，配合 `v-model:value` 使用。
   *
   * @defaultValue ''
   * @remarks **不是严格受控**：组件不会把用户编辑写回本属性，也不会在每次更新时
   * 强行拉平文档。本属性变化时只同步公共前后缀之间的那一段差量，光标、选区与滚动位置都保留，
   * 且不进 undo 栈。父组件忽略 `update:value` 时编辑器会保留用户输入。
   */
  readonly value?: string;
}

/** Vue CodeEditor 的公开事件。 */
export interface CodeEditorEmits {
  /** 编辑器内容区域失去焦点。 */
  blur: [];
  /** 用户编辑导致的内容变化；宿主经 `value` 的程序化写入**不**触发。 */
  change: [value: string];
  /** 编辑器内容区域获得焦点。 */
  focus: [];
  /**
   * 语言解析或加载失败。
   *
   * @remarks
   * CEV-004：这条路径此前只有一条 `console.error`，宿主完全观测不到 ——
   * 拿不到错误、没有重试或降级的机会，用户只看到高亮突然消失。
   * 降级策略不变（清空语言扩展退回纯文本），日志也保留，本事件是**新增的**观测通道。
   * 载荷由核心包定义，与 Angular 的 `aoLanguageError` 输出、React 的 `onLanguageError`
   * 回调逐字一致：`kind` 为 `'not-found'` 时是配置错误，重试没有意义；
   * 为 `'load-failed'` 时通常是网络或分包问题，可以重试。
   */
  'language-error': [error: CodeEditorLanguageError];
  /** `v-model:value` 的更新通道，触发时机与 `change` 相同。 */
  'update:value': [value: string];
}

/**
 * `defineExpose` 暴露给模板 ref 的命令式 API。
 *
 * @remarks 四个成员与 React 的 `CodeEditorHandle`、Angular 组件实例上的同名成员
 * 逐字对齐（CEA-009）—— 跨端迁移时命令式面不需要改写。
 */
export interface CodeEditorExpose {
  /** 底层 CodeMirror EditorView，未挂载或已卸载时为 null。 */
  readonly view: EditorView | null;
  /** 宿主 `div` 元素（CodeMirror 挂载所在的容器），未挂载或已卸载时为 null。 */
  readonly host: HTMLDivElement | null;
  /** 移开键盘焦点；未挂载时是空操作。 */
  blur(): void;
  /** 把键盘焦点交给编辑器内容区域；未挂载时是空操作。 */
  focus(): void;
}

export type { CodeEditorTheme } from '@aiao/code-editor';
