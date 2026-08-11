import type {
  CodeEditorLanguageDescription,
  CodeEditorLanguageError,
  CodeEditorTheme,
  ResolvedCodeEditorLanguage
} from '@aiao/code-editor';
import {
  buildCodeEditorContentAttributes,
  codeEditorLanguageLoadFailed,
  codeEditorLanguageNotFound,
  computeMinimalDocumentChange,
  isSameResolvedLanguage,
  resolveCodeEditorLanguage,
  shouldAutoFocusCodeEditor,
  SUPPORT_LANGUAGES
} from '@aiao/code-editor';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Annotation, Compartment, EditorState, type Extension, Transaction } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightWhitespace, keymap, placeholder as placeholderExt } from '@codemirror/view';
import { basicSetup, minimalSetup } from 'codemirror';
import type { CSSProperties, HTMLAttributes, Ref } from 'react';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';

const External = Annotation.define<boolean>();
const DEFAULT_HOST_CLASS_NAME = 'h-full w-full overflow-hidden text-xs';
const DEFAULT_HOST_STYLE: CSSProperties = {
  fontSize: '12px',
  height: '100%',
  overflow: 'hidden',
  width: '100%'
};

export type { CodeEditorTheme } from '@aiao/code-editor';

export type CodeEditorSetup = 'basic' | 'minimal' | null;
type CodeEditorHostProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML' | 'onChange'>;

/** CodeEditor 命令式句柄。 */
export interface CodeEditorHandle {
  /** 底层 CodeMirror EditorView，未挂载或已卸载时为 null。 */
  readonly view: EditorView | null;
  /** 宿主 div 元素，未挂载或已卸载时为 null。 */
  readonly host: HTMLDivElement | null;
  blur(): void;
  focus(): void;
}

/**
 * `CodeEditor` 的属性。未列出的属性透传给宿主 `div`（`className` / `style` /
 * `data-*` / DOM 事件等），`children` / `dangerouslySetInnerHTML` / `onChange` 除外。
 */
export interface CodeEditorProps extends CodeEditorHostProps {
  /** 命令式句柄，见 {@link CodeEditorHandle}。 */
  ref?: Ref<CodeEditorHandle>;
  /**
   * 文档内容。
   *
   * @defaultValue ''
   * @remarks **不是严格受控**：组件不会把用户编辑写回本属性，也不会在每次渲染时
   * 强行拉平文档。本属性变化时只同步公共前后缀之间的那一段差量（见
   * {@link computeMinimalDocumentChange}），光标、选区与滚动位置都保留。
   * 要做受控请把 `onChange` 的值存进 state 再传回来。
   */
  value?: string;
  /**
   * 用户编辑导致的内容变化。程序化写入（`value` 同步）**不**触发。
   *
   * @remarks 回调用 ref 承接，不进 effect 依赖 —— 宿主写内联箭头函数时
   * 每次渲染都是新引用，进依赖就等于每次渲染都重装 update listener。
   */
  onChange?: (value: string) => void;
  /**
   * 主题。
   *
   * @defaultValue 'light'
   */
  theme?: CodeEditorTheme;
  /**
   * 语法高亮语言名或别名；`''` 与 `'plaintext'` 表示不高亮。
   *
   * @defaultValue 'sql'
   */
  language?: string;
  /**
   * 候选语言列表；空列表表示不高亮。
   *
   * @defaultValue SUPPORT_LANGUAGES
   * @remarks 传内联字面量（`languages={[myLang]}`）是有成本的：每次渲染都是新数组。
   * 组件按元素身份逐项判等，再按 {@link isSameResolvedLanguage} 判断当前语言解析到的
   * description 是否真的换了 —— 只有真换了才重新 `load()`。但这两层判断本身仍要跑，
   * 稳定引用（模块级常量或 `useMemo`）更省。
   */
  languages?: readonly CodeEditorLanguageDescription[];
  /** 空文档时显示的占位文本。 */
  placeholder?: string;
  /**
   * 只读：仍可聚焦、可选择、可复制，但不能改。
   *
   * @defaultValue false
   */
  readonly?: boolean;
  /**
   * 禁用：只读且不可编辑，并向辅助技术报告 `aria-disabled`。
   *
   * @defaultValue false
   * @remarks 与 `readonly` 是独立的两个属性，任一为真都会让编辑器不可编辑；
   * 区别在于禁用还会写出 `aria-disabled` 并抑制 `autoFocus`。
   */
  disabled?: boolean;
  /**
   * 可访问名称，写成内部 textbox 的 `aria-label`。
   *
   * @remarks 属性落在 CodeMirror 的 `.cm-content` 上 —— 承担 `role="textbox"` 的是它，
   * 不是宿主 `div`。空串按「未设置」处理。三端同名同义。
   *
   * 与直接透传给宿主的 `aria-label` 不冲突：那一份留在宿主元素上不动。
   */
  label?: string;
  /**
   * 承担标签的元素 id，写成内部 textbox 的 `aria-labelledby`。
   *
   * @remarks 落点与 {@link CodeEditorProps.label} 相同。
   */
  labelledBy?: string;
  /**
   * 补充说明元素的 id，写成内部 textbox 的 `aria-describedby`。
   *
   * @remarks 落点与 {@link CodeEditorProps.label} 相同。
   */
  describedBy?: string;
  /**
   * CodeMirror 预设扩展集；`null` 表示不加载任何预设。
   *
   * @defaultValue 'basic'
   */
  setup?: CodeEditorSetup;
  /**
   * 允许 Tab 键缩进。
   *
   * @defaultValue false
   * @remarks 打开后 Tab 不再移动焦点，键盘用户会被困在编辑器里 —— 这是可达性取舍，
   * 三端默认一致地关闭。
   */
  indentWithTab?: boolean;
  /**
   * 一级缩进使用的字符串。
   *
   * @defaultValue '  '（两个空格，三端一致）
   */
  indentUnit?: string;
  /**
   * 自动换行。
   *
   * @defaultValue false
   */
  lineWrapping?: boolean;
  /**
   * 显示空白字符。
   *
   * @defaultValue false
   */
  highlightWhitespace?: boolean;
  /**
   * 挂载后立即聚焦编辑器。
   *
   * @defaultValue false
   * @remarks **仅首次挂载读取**，后续变更被忽略。`disabled` 或 `readonly` 为真时
   * 不抢焦点，判定用的也是挂载那一刻的值。
   */
  autoFocus?: boolean;
  /**
   * CodeMirror 挂载的 DOM 根，用于 Shadow DOM 场景。
   *
   * @remarks **仅首次挂载读取** —— CodeMirror 无法在构造后改 root。
   * 需要换 root 时请用 `key` 强制重建组件。
   */
  root?: Document | ShadowRoot;
  /**
   * 语言解析或加载失败。
   *
   * @remarks
   * CER-004：这条路径此前只有一条 `console.error`，宿主完全观测不到 ——
   * 拿不到错误、没有重试或降级的机会，用户只看到高亮突然消失。
   * 降级策略不变（清空语言扩展退回纯文本），日志也保留，本回调是**新增的**观测通道。
   * 与 Angular 的 `aoLanguageError` 输出、Vue 的 `language-error` 事件同载荷。
   *
   * 与 `onChange` 同样用 ref 承接，不进语言 effect 的依赖。
   */
  onLanguageError?: (error: CodeEditorLanguageError) => void;
}

const setupExtensions = {
  basic: basicSetup,
  minimal: minimalSetup
} satisfies Record<Exclude<CodeEditorSetup, null>, Extension>;

const getSetupExtension = (setup: CodeEditorSetup): Extension => (setup === null ? [] : setupExtensions[setup]);

/** 按元素身份逐项比较语言列表：内容相同的新数组不应触发语言重配置。 */
const isSameLanguageList = (
  left: readonly CodeEditorLanguageDescription[],
  right: readonly CodeEditorLanguageDescription[]
): boolean => left.length === right.length && left.every((item, index) => item === right[index]);

/**
 * 把外部传入的 `value` 同步进文档，只改写公共前后缀之间的那一段。
 *
 * @remarks
 * 整篇替换（`from: 0, to: len`）会让 CodeMirror 把落在被替换区间内的选区映射到区间起点，
 * 光标无条件跳到文档开头，滚动位置与选区全部丢失；undo 历史里还会多出一条「全文替换」。
 * 算最小 diff 后，未改动的部分不进 changeset，选区由 CodeMirror 自然映射。
 */
/**
 * 把宿主传入的 `value` 同步进编辑器。
 *
 * @remarks
 * CER-001：差量计算移到核心包的 {@link computeMinimalDocumentChange}，
 * 三端共用同一份，避免各写一套后分叉。
 *
 * `Transaction.addToHistory.of(false)` 不可省：`External` annotation 只被本组件的
 * update listener 用来阻止回调环路，**CodeMirror 的 history 不认识它** ——
 * 少了这条，宿主回写照样进 undo 栈，用户第一次 Ctrl+Z 会被送回「宿主同步之前」的内容。
 */
const syncDocument = (view: EditorView, next: string): void => {
  const changes = computeMinimalDocumentChange(view.state.doc.toString(), next);
  if (!changes) return;

  view.dispatch({
    changes,
    annotations: [External.of(true), Transaction.addToHistory.of(false)],
    scrollIntoView: false
  });
};

/**
 * CodeMirror 代码编辑器 React 组件
 *
 * @example
 * ```tsx
 * import { CodeEditor } from '@aiao/code-editor-react';
 *
 * function App() {
 *   const [code, setCode] = useState('SELECT * FROM users');
 *
 *   return (
 *     <CodeEditor
 *       value={code}
 *       onChange={setCode}
 *       language="sql"
 *       theme="dark"
 *     />
 *   );
 * }
 * ```
 */
export function CodeEditor({
  value = '',
  onChange,
  theme = 'light',
  language = 'sql',
  languages = SUPPORT_LANGUAGES,
  placeholder,
  readonly = false,
  disabled = false,
  label = '',
  labelledBy = '',
  describedBy = '',
  setup = 'basic',
  indentWithTab: enableIndentWithTab = false,
  indentUnit: indentUnitValue = '  ',
  lineWrapping = false,
  highlightWhitespace: enableHighlightWhitespace = false,
  autoFocus = false,
  root,
  onLanguageError,
  ref,
  className,
  style,
  ...hostProps
}: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onLanguageErrorRef = useRef(onLanguageError);
  // `autoFocus` 只在挂载时生效，判定所需的 `disabled` / `readonly` 也必须取挂载那一刻的值，
  // 否则后续改这两个 prop 会让「是否曾经自动聚焦过」变成一个无法复现的历史问题。
  const initialConfigRef = useRef({ autoFocus, disabled, readonly, root, value });
  const setupConf = useRef(new Compartment());
  const languageConf = useRef(new Compartment());
  const themeConf = useRef(new Compartment());
  const readonlyConf = useRef(new Compartment());
  const editableConf = useRef(new Compartment());
  const placeholderConf = useRef(new Compartment());
  const indentWithTabConf = useRef(new Compartment());
  const indentUnitConf = useRef(new Compartment());
  const lineWrappingConf = useRef(new Compartment());
  const highlightWhitespaceConf = useRef(new Compartment());
  const a11yConf = useRef(new Compartment());
  /**
   * 最近一次**已生效**的语言解析结果，用于跳过等价的重复配置（CEA-006 / CEV-003 的 React 面）。
   *
   * 连同当时的 view 一起记：ref 的寿命长于 effect，StrictMode 下 effect 会被卸载重挂、
   * view 也随之重建，只比解析结果就会把重建后的空 compartment 当成「已经配好了」。
   */
  const appliedLanguageRef = useRef<{
    readonly resolved: ResolvedCodeEditorLanguage;
    readonly view: EditorView;
  } | null>(null);
  /** 语言加载的单调请求号，只在真正决定重新应用语言时递增。 */
  const languageRequestRef = useRef(0);

  // languages 是数组，直接进 effect 依赖会按引用比较：消费者写内联字面量
  // `languages={[myLang]}` 时父组件每渲染一次就重建语言 StateField = 整篇重新词法分析。
  // 按元素身份判等后，内容不变的新数组沿用上一次的引用。
  const [stableLanguages, setStableLanguages] = useState(languages);
  if (stableLanguages !== languages && !isSameLanguageList(stableLanguages, languages)) {
    setStableLanguages(languages);
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 与 `onChange` 同构：回调进语言 effect 的依赖，宿主写内联箭头函数时
  // 每次渲染都会重跑语言 effect —— 整篇重新词法分析，还多发一次 `load()`。
  useEffect(() => {
    onLanguageErrorRef.current = onLanguageError;
  }, [onLanguageError]);

  useEffect(() => {
    const parent = editorRef.current;
    if (!parent) return;

    const extensions: Extension[] = [
      setupConf.current.of([]),
      languageConf.current.of([]),
      themeConf.current.of([]),
      readonlyConf.current.of([]),
      editableConf.current.of([]),
      placeholderConf.current.of([]),
      indentWithTabConf.current.of([]),
      indentUnitConf.current.of([]),
      lineWrappingConf.current.of([]),
      highlightWhitespaceConf.current.of([]),
      a11yConf.current.of([]),
      EditorView.theme({
        '&': { height: '100%', fontSize: '12px' },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-gutters': { background: 'initial', border: 'none' }
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(External))) {
          onChangeRef.current?.(update.state.doc.toString());
        }
      })
    ];
    const initialConfig = initialConfigRef.current;
    const state = EditorState.create({ doc: initialConfig.value, extensions });
    const view = new EditorView({
      state,
      parent,
      ...(initialConfig.root ? { root: initialConfig.root } : {})
    });

    viewRef.current = view;
    // CER-006（用户可见的行为修正）：`disabled` / `readonly` 都会把编辑器配成不可编辑，
    // 此时仍然抢焦点，用户只会得到一个无法输入、也无从得知为什么无法输入的控件。
    if (initialConfig.autoFocus && shouldAutoFocusCodeEditor(initialConfig)) view.focus();

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get view() {
        return viewRef.current;
      },
      get host() {
        return editorRef.current;
      },
      blur: () => viewRef.current?.contentDOM.blur(),
      focus: () => viewRef.current?.focus()
    }),
    []
  );

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setupConf.current.reconfigure(getSetupExtension(setup)) });
  }, [setup]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeConf.current.reconfigure(theme === 'dark' ? oneDark : [])
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        readonlyConf.current.reconfigure(EditorState.readOnly.of(readonly || disabled)),
        editableConf.current.reconfigure(EditorView.editable.of(!readonly && !disabled))
      ]
    });
  }, [readonly, disabled]);

  // CER-006：可访问名称与禁用语义必须落在真正承担 `role="textbox"` 的 `.cm-content` 上。
  // 只在宿主 div 上补 `aria-*` 是把缺陷换个位置 —— 屏幕阅读器进到 textbox 之后读到的
  // 仍然是一个没有名称、只报 `aria-readonly` 的多行文本框。属性字典由核心包计算，三端共用。
  useEffect(() => {
    const attributes = buildCodeEditorContentAttributes({ describedBy, disabled, label, labelledBy });
    viewRef.current?.dispatch({
      effects: a11yConf.current.reconfigure(EditorView.contentAttributes.of(attributes))
    });
  }, [describedBy, disabled, label, labelledBy]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderConf.current.reconfigure(placeholder ? placeholderExt(placeholder) : [])
    });
  }, [placeholder]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indentWithTabConf.current.reconfigure(enableIndentWithTab ? keymap.of([indentWithTab]) : [])
    });
  }, [enableIndentWithTab]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indentUnitConf.current.reconfigure(indentUnitValue ? indentUnit.of(indentUnitValue) : [])
    });
  }, [indentUnitValue]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineWrappingConf.current.reconfigure(lineWrapping ? EditorView.lineWrapping : [])
    });
  }, [lineWrapping]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightWhitespaceConf.current.reconfigure(enableHighlightWhitespace ? highlightWhitespace() : [])
    });
  }, [enableHighlightWhitespace]);

  // CEA-006 / CEV-003 的 React 面：`stableLanguages` 只挡住了「整份列表逐项相同」的新数组，
  // 列表里**任何一项**换掉仍会重跑本 effect —— 哪怕换的那项根本没被选中。
  // 判定基准改成「当前语言实际解析到的 description identity」，与 Angular / Vue 同构。
  //
  // 竞态守卫同时从 effect cleanup 的 `cancelled` 标记改成单调请求号：cleanup 会在
  // **每次** effect 重跑时触发，而重跑现在多数会被上面的等价判断挡掉；沿用 `cancelled`
  // 就会把仍在飞行的 `load()` 取消掉却不再重发，语言永远装不上。请求号只在真正决定
  // 重新应用时递增，因此被跳过的重跑不会影响在飞请求。
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const resolved = resolveCodeEditorLanguage(language, stableLanguages);
    const applied = appliedLanguageRef.current;
    if (applied?.view === view && isSameResolvedLanguage(applied.resolved, resolved)) return;

    const request = ++languageRequestRef.current;
    appliedLanguageRef.current = { resolved, view };
    const isCurrentRequest = () => request === languageRequestRef.current && viewRef.current === view;

    if (resolved.kind !== 'found') {
      view.dispatch({ effects: languageConf.current.reconfigure([]) });
      if (resolved.kind === 'not-found') {
        // 日志与另两端逐字一致，作为最后兜底诊断保留；结构化回调才是给宿主的契约通道。
        console.error(`[CodeEditor] Language '${language}' not found.`);
        onLanguageErrorRef.current?.(codeEditorLanguageNotFound(language));
      }
      return;
    }

    void resolved.description.load().then(
      languageSupport => {
        if (!isCurrentRequest()) return;
        view.dispatch({
          effects: languageConf.current.reconfigure(languageSupport.extension as Extension)
        });
      },
      (error: unknown) => {
        if (!isCurrentRequest()) return;
        view.dispatch({ effects: languageConf.current.reconfigure([]) });
        console.error(`[CodeEditor] Failed to load language '${language}':`, error);
        onLanguageErrorRef.current?.(codeEditorLanguageLoadFailed(language, error));
      }
    );
  }, [language, stableLanguages]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    syncDocument(view, value);
  }, [value]);

  const hostClassName = className ? `${DEFAULT_HOST_CLASS_NAME} ${className}` : DEFAULT_HOST_CLASS_NAME;

  return (
    <div
      {...hostProps}
      ref={editorRef}
      // 放在展开之后：`disabled` 是组件自己的受控状态，不能被宿主透传的同名属性顶掉。
      // 未禁用时给 `undefined` 让 React 移除属性，而不是写 `aria-disabled="false"`。
      aria-disabled={disabled || undefined}
      className={hostClassName}
      style={{ ...DEFAULT_HOST_STYLE, ...style }}
    />
  );
}
