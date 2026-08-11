/**
 * @fileoverview `@aiao/code-editor-angular` —— 基于 CodeMirror 6 的 Angular 组件实现。
 *
 * 与 React / Vue 同名同语义：三端共用 `@aiao/code-editor` 的语言解析与无障碍工具，
 * 这里只承担 Angular 生命周期、`signal` 输入与 `ControlValueAccessor` 表单集成。
 *
 * @module @aiao/code-editor-angular
 */
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
import { isPlatformBrowser } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  forwardRef,
  inject,
  input,
  OnChanges,
  OnDestroy,
  OnInit,
  output,
  PLATFORM_ID,
  signal,
  SimpleChanges
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Annotation, Compartment, EditorState, Extension, StateEffect, Transaction } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightWhitespace, keymap, placeholder } from '@codemirror/view';
import { basicSetup, minimalSetup } from 'codemirror';

export type { CodeEditorTheme } from '@aiao/code-editor';

/** CodeMirror 预设配置。 */
export type CodeEditorSetup = 'basic' | 'minimal' | null;

/**
 * 标记「外部写入」的注解，用于让 updateListener 跳过 onChange 回调。
 *
 * @internal
 * 模块私有，不对外导出：每个框架绑定各有一个互不相同的 Annotation 实例，
 * 一旦暴露就等于承诺了一个三端无法对齐的语义（React / Vue 两端同样是模块私有）。
 */
const External = Annotation.define<boolean>();

/**
 * CodeEditor Angular 组件
 *
 * 基于 CodeMirror 6 的代码编辑器 Angular 组件，支持多种语言和主题
 *
 * @example
 * ```html
 * <ao-code-editor
 *   [(ngModel)]="code"
 *   language="typescript"
 *   theme="dark"
 *   (aoChange)="onCodeChange($event)"
 * />
 * ```
 */
@Component({
  selector: 'ao-code-editor',
  template: ``,
  styleUrl: './code-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // 宿主上的 `aria-disabled` 与 React / Vue 同名同值。但承担 `role="textbox"` 的是
  // CodeMirror 的 `.cm-content`，那一侧另走 `#a11yConf`，见 {@link CodeEditor.#syncContentAttributes}。
  host: {
    '[attr.aria-disabled]': '_ariaDisabled()'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodeEditor),
      multi: true
    }
  ]
})
export class CodeEditor implements OnInit, ControlValueAccessor, OnDestroy, OnChanges {
  /**
   * EditorView 实例。
   * https://codemirror.net/docs/ref/#view.EditorView
   */
  #view?: EditorView;
  #pendingValue?: string;
  #languageRequest = 0;
  /** 最近一次**已生效**的语言解析结果，用于跳过等价的重复配置（CEA-006）。 */
  #appliedLanguage?: ResolvedCodeEditorLanguage;

  #elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  #platformId = inject(PLATFORM_ID);
  #isBrowser = isPlatformBrowser(this.#platformId);

  // 用于动态重新配置的 Compartments。
  // https://codemirror.net/docs/ref/#state.Compartment
  #editableConf = new Compartment();
  #readonlyConf = new Compartment();
  #themeConf = new Compartment();
  #placeholderConf = new Compartment();
  #indentWithTabConf = new Compartment();
  #indentUnitConf = new Compartment();
  #lineWrappingConf = new Compartment();
  #highlightWhitespaceConf = new Compartment();
  #languageConf = new Compartment();
  #a11yConf = new Compartment();
  /** `setup` 预设的专属槽 —— 与 React（`CodeEditor.tsx`）、Vue（`CodeEditor.vue`）同构。 */
  #setupConf = new Compartment();
  /** 消费者经 {@link CodeEditor.setExtensions} 装入的扩展的专属槽，见 CEA-003。 */
  #userExtensionsConf = new Compartment();

  // 内容变化监听器。
  #updateListener = EditorView.updateListener.of(vu => {
    if (vu.docChanged && !vu.transactions.some(tr => tr.annotation(External))) {
      const value = vu.state.doc.toString();
      this.#onChange?.(value);
      this.aoChange.emit(value);
    }
  });

  // 焦点事件必须随初始 extensions 一起装配，不能在 EditorView 构造完再 addEventListener：
  // `autoFocus` 的 `view.focus()` 紧跟构造同步派发 focus，后注册的监听器永远吞掉第一次。
  // 用 domEventObservers 还顺带解决了裸监听器没有 removeEventListener 的问题 ——
  // 它随 view.destroy() 一起回收。与 Vue（`CodeEditor.vue:75-78`）同构。
  #domEventObservers = EditorView.domEventObservers({
    focus: () => {
      this.aoFocus.emit();
    },
    blur: () => {
      this.#onTouched?.();
      this.aoBlur.emit();
    }
  });

  /**
   * 表单侧的禁用状态，只由 {@link CodeEditor.setDisabledState} 写入。
   *
   * @internal
   * 必须私有：它只在 `#effectiveDisabled` 里被消费，外部 `.set()` 写了也不会同步到编辑器。
   */
  readonly #formDisabled = signal(false);

  /**
   * 有效禁用状态 = `disabled` 输入与表单禁用**任一为真**。
   *
   * @internal
   * CEA-004：两条来源早先被压进同一个 `linkedSignal(() => this.disabled())`，
   * 成了「最后写的赢」。它们是**独立的事实**：模板的 `[disabled]="true"` 说
   * 「这个控件永远禁用」，`setDisabledState()` 说「这个 FormControl 当前 disable 了」。
   * 压成一个值有两个可复现的后果 —— Reactive Forms 在控件 enabled 时会主动调
   * `setDisabledState(false)`，把 `[disabled]="true"` 静默抹掉；反过来 `disabled`
   * 输入一变化 `linkedSignal` 就重算，把表单侧刚设的禁用丢掉。
   */
  readonly #effectiveDisabled = computed(() => this.disabled() || this.#formDisabled());

  /** @internal 只能经 {@link registerOnChange} 注入，公开会让消费者覆盖后静默切断表单双向绑定。 */
  #onChange?: (value: string) => void;
  /** @internal 只能经 {@link registerOnTouched} 注入，理由同 {@link registerOnChange}。 */
  #onTouched?: () => void;

  /**
   * 宿主元素上的 `aria-disabled`。
   *
   * @internal
   * 未禁用时返回 `null` 让 Angular **移除**属性，而不是写 `aria-disabled="false"`；
   * 理由与 {@link buildCodeEditorContentAttributes} 一致。`protected` 是可见性下限 ——
   * host 绑定表达式读不到 `#` 私有字段。
   */
  protected readonly _ariaDisabled = computed(() => (this.#effectiveDisabled() ? 'true' : null));

  // 输入属性。
  /** 初始化后立即聚焦编辑器。**仅初始化生效**，后续变更被忽略。 @defaultValue false */
  autoFocus = input(false, { transform: booleanAttribute });
  /**
   * 补充说明元素的 id，写成内部 textbox 的 `aria-describedby`。可动态更新。
   *
   * @defaultValue ''（空串按「未设置」处理，不产出属性）
   * @remarks 属性落在 CodeMirror 的 `.cm-content` 上 —— 承担 `role="textbox"` 的是它，
   * 不是本组件的宿主元素。三端同名同义。
   */
  describedBy = input<string>('');
  /**
   * 禁用编辑（只读且不可聚焦）。可动态更新。
   *
   * @defaultValue false
   * @remarks 与表单的 `setDisabledState()` 是**两条独立来源**，任一为真即禁用。
   * 用 Reactive Forms 时把控件设成 `disabled` 与在模板上写 `[disabled]="true"` 效果一样，
   * 但只解开其中一条不会恢复可编辑 —— 两条都得放开。
   */
  disabled = input(false, { transform: booleanAttribute });
  /** 显示空白字符。可动态更新。 @defaultValue false */
  highlightWhitespace = input(false, { transform: booleanAttribute });
  /** 一级缩进使用的字符串。可动态更新。 @defaultValue '  '（两个空格，三端一致） */
  indentUnit = input<string>('  ');
  /** 允许 Tab 键缩进（会牺牲键盘可达性）。可动态更新。 @defaultValue false */
  indentWithTab = input(false, { transform: booleanAttribute });
  /** 语法高亮语言名，取值见 {@link languages}；`'plaintext'` 表示不高亮。可动态更新。 @defaultValue 'sql' */
  language = input<string>('sql');
  /** 可选语言列表。可动态更新。 @defaultValue SUPPORT_LANGUAGES */
  languages = input<readonly CodeEditorLanguageDescription[]>(SUPPORT_LANGUAGES);
  /**
   * 可访问名称，写成内部 textbox 的 `aria-label`。可动态更新。
   *
   * @defaultValue ''（空串按「未设置」处理，不产出属性）
   * @remarks 落点与 {@link CodeEditor.describedBy} 相同。
   */
  label = input<string>('');
  /**
   * 承担标签的元素 id，写成内部 textbox 的 `aria-labelledby`。可动态更新。
   *
   * @defaultValue ''（空串按「未设置」处理，不产出属性）
   * @remarks 落点与 {@link CodeEditor.describedBy} 相同。
   */
  labelledBy = input<string>('');
  /** 自动换行。可动态更新。 @defaultValue false */
  lineWrapping = input(false, { transform: booleanAttribute });
  /** 空文档时显示的占位文本。可动态更新。 @defaultValue '' */
  placeholder = input<string>('');
  /** 只读（仍可聚焦与选择）。可动态更新。 @defaultValue false */
  readonly = input(false, { transform: booleanAttribute });
  /** CodeMirror 挂载的 DOM 根，用于 Shadow DOM 场景。**仅初始化生效**。 */
  root = input<Document | ShadowRoot>();
  /** 预设扩展集；`null` 表示不加载任何预设。可动态更新。 @defaultValue 'basic' */
  setup = input<CodeEditorSetup>('basic');
  /** 主题。可动态更新。 @defaultValue 'light' */
  theme = input<CodeEditorTheme>('light');
  /** 文档内容。作为受控输入使用时由外部驱动；与 `ngModel` 同时使用以 `ngModel` 为准。 @defaultValue '' */
  value = input<string>('');

  // 输出事件。
  /** 编辑器获得焦点。 */
  aoFocus = output<void>();
  /** 文档内容变化（外部写入不触发，见 {@link External}）。 */
  aoChange = output<string>();
  /** 编辑器失去焦点，同时触发表单 touched。 */
  aoBlur = output<void>();
  /**
   * 语言解析或加载失败。
   *
   * @remarks
   * CEA-007：这条路径此前只有一条 `console.error`，宿主完全观测不到 ——
   * 拿不到错误、没有重试或降级的机会，用户只看到高亮突然消失。
   * 降级策略不变（清空语言扩展退回纯文本），日志也保留，本事件是**新增的**观测通道。
   * 与 React 的 `onLanguageError` 属性、Vue 的 `language-error` 事件同载荷。
   */
  aoLanguageError = output<CodeEditorLanguageError>();

  /**
   * 底层 CodeMirror `EditorView`；未初始化或已销毁时为 `null`。
   *
   * @remarks 三端命令式面统一为 `view` / `host` / `focus()` / `blur()`（CEA-009）。
   */
  get view(): EditorView | null {
    return this.#view ?? null;
  }

  /**
   * CodeMirror 挂载所在的宿主元素；未初始化或已销毁时为 `null`。
   *
   * @remarks
   * Angular 的宿主是 `<ao-code-editor>` 元素本身，React / Vue 是组件渲染出的 `div`——
   * 类型不同但语义一致：「CodeMirror 挂在哪个元素里」。
   */
  get host(): HTMLElement | null {
    return this.#view ? this.#elementRef.nativeElement : null;
  }

  /** 把键盘焦点交给编辑器。未初始化时是空操作。 */
  focus(): void {
    this.#view?.focus();
  }

  /** 移开键盘焦点。未初始化时是空操作。 */
  blur(): void {
    this.#view?.contentDOM.blur();
  }

  ngOnInit() {
    if (!this.#isBrowser) return;
    const extensions: Extension[] = this._get_all_extensions();
    const state = EditorState.create({ doc: this.#pendingValue ?? this.value(), extensions });
    this.#view = new EditorView({
      parent: this.#elementRef.nativeElement,
      root: this.root(),
      state
    });

    // 访问状态必须先落地：`autoFocus` 要读**已生效**的禁用 / 只读语义，而 `focus()`
    // 又会同步派发 focus 事件，晚同步等于让监听者先读到一个还没对齐的状态。
    this.#syncAccessState();
    // CEA-008（用户可见的行为修正）：`disabled` / `readonly` 都会把编辑器配成不可编辑，
    // 此时仍然抢焦点，用户只会得到一个无法输入、也无从得知为什么无法输入的控件。
    if (
      this.autoFocus() &&
      shouldAutoFocusCodeEditor({ disabled: this.#effectiveDisabled(), readonly: this.readonly() })
    ) {
      this.#view.focus();
    }
    this._dispatch_effects(this.#themeConf.reconfigure(this.theme() === 'dark' ? oneDark : []));
    this._dispatch_effects(
      this.#placeholderConf.reconfigure(this.placeholder() ? placeholder(this.placeholder()) : [])
    );
    this._dispatch_effects(this.#indentWithTabConf.reconfigure(this.indentWithTab() ? keymap.of([indentWithTab]) : []));
    this._dispatch_effects(this.#indentUnitConf.reconfigure(this.indentUnit() ? indentUnit.of(this.indentUnit()) : []));
    this._dispatch_effects(this.#lineWrappingConf.reconfigure(this.lineWrapping() ? EditorView.lineWrapping : []));
    this._dispatch_effects(
      this.#highlightWhitespaceConf.reconfigure(this.highlightWhitespace() ? highlightWhitespace() : [])
    );
    this.setLanguage(this.language());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.#view) return;
    if (changes['value'] && this.#view) {
      const newValue = this.value();
      const change = computeMinimalDocumentChange(this.#view.state.doc.toString(), newValue);
      if (change) {
        this.#view.dispatch({
          changes: change,
          annotations: [External.of(true), Transaction.addToHistory.of(false)],
          scrollIntoView: false
        });
      }
    }
    if (changes['disabled'] || changes['readonly']) {
      this.#syncAccessState();
    }
    if (changes['describedBy'] || changes['label'] || changes['labelledBy']) {
      this.#syncContentAttributes();
    }
    if (changes['theme']) {
      this._dispatch_effects(this.#themeConf.reconfigure(this.theme() === 'dark' ? oneDark : []));
    }
    if (changes['placeholder']) {
      this._dispatch_effects(
        this.#placeholderConf.reconfigure(this.placeholder() ? placeholder(this.placeholder()) : [])
      );
    }
    if (changes['indentWithTab']) {
      this._dispatch_effects(
        this.#indentWithTabConf.reconfigure(this.indentWithTab() ? keymap.of([indentWithTab]) : [])
      );
    }
    if (changes['indentUnit']) {
      this._dispatch_effects(
        this.#indentUnitConf.reconfigure(this.indentUnit() ? indentUnit.of(this.indentUnit()) : [])
      );
    }
    if (changes['lineWrapping']) {
      this._dispatch_effects(this.#lineWrappingConf.reconfigure(this.lineWrapping() ? EditorView.lineWrapping : []));
    }
    if (changes['highlightWhitespace']) {
      this._dispatch_effects(
        this.#highlightWhitespaceConf.reconfigure(this.highlightWhitespace() ? highlightWhitespace() : [])
      );
    }
    if (changes['language'] || changes['languages']) {
      this.#syncLanguage();
    }
    if (changes['setup']) {
      // CEA-003：早先这里调的是 `setExtensions(this._get_all_extensions())`，
      // 即换个预设就把整棵扩展树连同消费者自己装的扩展一起重建。
      this._dispatch_effects(this.#setupConf.reconfigure(this.#setupExtension()));
    }
  }

  ngOnDestroy(): void {
    this.#languageRequest += 1;
    const view = this.#view;
    this.#view = undefined;
    view?.destroy();
  }

  /**
   * `ControlValueAccessor` 的写入入口，由 Angular Forms 调用。
   *
   * @param value `null` / `undefined` 规整成空串；`string` 原样写入
   * @throws TypeError 收到其他类型时立即抛出，错误信息含包名与实际类型
   *
   * @remarks
   * CEA-005：签名此前写成 `string | null`，但 CVA 的契约是 `any` —— Angular
   * **不做**运行时校验，`FormControl` 里放什么就原样送到这里。类型标注只骗过了编译期。
   * 于是 `FormControl(42)` 在初始化前进 `#pendingValue`、在 `EditorState.create` 处炸，
   * 初始化后又在 `computeMinimalDocumentChange` 处炸 —— 同一个错误配置，两个时机两种错，
   * 且都指不回 `writeValue`。现在两个时机抛同一个错，且直接点名包与类型。
   */
  public writeValue(value: unknown): void {
    const normalized = this.#normalizeFormValue(value);
    if (!this.#view) {
      this.#pendingValue = normalized;
      return;
    }
    const change = computeMinimalDocumentChange(this.#view.state.doc.toString(), normalized);
    if (change) {
      this.#view.dispatch({
        changes: change,
        annotations: [External.of(true), Transaction.addToHistory.of(false)],
        scrollIntoView: false
      });
    }
  }

  public registerOnChange(fn: (value: string) => void): void {
    this.#onChange = fn;
  }

  public registerOnTouched(fn: () => void): void {
    this.#onTouched = fn;
  }

  /**
   * 表单侧的禁用开关，由 Angular Forms 调用。
   *
   * @remarks 只写 {@link CodeEditor.#formDisabled} 这一条来源；模板上的
   * `[disabled]` 输入是另一条独立来源，两者取或，见 {@link CodeEditor.#effectiveDisabled}。
   */
  public setDisabledState(isDisabled: boolean): void {
    this.#formDisabled.set(isDisabled);
    this.#syncAccessState();
  }

  /**
   * 装入消费者自己的 CodeMirror 扩展。
   *
   * @param value 本次要生效的扩展；**整体替换**上一次传入的那批，传 `[]` 即全部撤下
   *
   * @remarks
   * CEA-003：早先这里发的是全局 `StateEffect.reconfigure.of(value)`，
   * 它替换的是**整棵扩展树** —— 一次调用就清掉 updateListener、全部 Compartment、
   * 主题、语言与 a11y 属性，名字叫「设置扩展」，实际是「摧毁编辑器配置」。
   * 现在只重配 {@link CodeEditor.#userExtensionsConf} 这一个专属槽，
   * 组件自身的配置与消费者的扩展互不影响。
   */
  setExtensions(value: Extension[]) {
    this._dispatch_effects(this.#userExtensionsConf.reconfigure(value));
  }

  /**
   * 命令式地（重新）应用语言配置。
   *
   * @param lang 语言名或别名；空串与 `'plaintext'` 表示不高亮
   *
   * @remarks
   * **无条件重新加载**，即使解析结果与当前生效的完全一致 —— 这是宿主换掉了同名描述
   * 背后的 loader 实现时的显式重载入口，`language` 输入做不到（它走的是
   * {@link CodeEditor.#syncLanguage} 里的等价性判断，CEA-006，不会重复加载）。
   * 日常切换语言应当改 `language` 输入。
   *
   * 解析失败时清空语言扩展退回纯文本，并经 {@link CodeEditor.aoLanguageError} 报告。
   */
  setLanguage(lang: string) {
    const request = ++this.#languageRequest;
    const view = this.#view;
    if (!view) return;
    const resolved = resolveCodeEditorLanguage(lang, this.languages());
    this.#appliedLanguage = resolved;
    if (resolved.kind === 'none') {
      view.dispatch({ effects: this.#languageConf.reconfigure([]) });
      return;
    }
    if (resolved.kind === 'not-found') {
      view.dispatch({ effects: this.#languageConf.reconfigure([]) });
      // 日志与另两端逐字一致，作为最后兜底诊断保留；结构化事件才是给宿主的契约通道。
      console.error(`[CodeEditor] Language '${lang}' not found.`);
      this.aoLanguageError.emit(codeEditorLanguageNotFound(lang));
      return;
    }
    // 直接用解析结果里的 description：早先这里又调一次 `_find_language(lang)` 重查一遍，
    // 同一个名字解析两遍，两处判定一旦分叉就会出现「解析说找到了、重查说没有」。
    void resolved.description.load().then(
      languageSupport => {
        if (request !== this.#languageRequest || this.#view !== view) return;
        view.dispatch({ effects: this.#languageConf.reconfigure(languageSupport.extension as Extension) });
      },
      (error: unknown) => {
        if (request !== this.#languageRequest || this.#view !== view) return;
        view.dispatch({ effects: this.#languageConf.reconfigure([]) });
        console.error(`[CodeEditor] Failed to load language '${lang}':`, error);
        this.aoLanguageError.emit(codeEditorLanguageLoadFailed(lang, error));
      }
    );
  }

  protected _get_all_extensions() {
    const extensions: Extension[] = [
      this.#updateListener,
      this.#domEventObservers,
      this.#editableConf.of([]),
      this.#readonlyConf.of([]),
      this.#themeConf.of([]),
      this.#placeholderConf.of([]),
      this.#indentWithTabConf.of([]),
      this.#indentUnitConf.of([]),
      this.#lineWrappingConf.of([]),
      this.#highlightWhitespaceConf.of([]),
      this.#languageConf.of([]),
      this.#a11yConf.of([]),
      this.#setupConf.of(this.#setupExtension()),
      // 消费者扩展排在最后 —— CodeMirror 里后来的优先级更高，
      // 宿主装的 keymap / 主题覆盖才压得住预设。
      this.#userExtensionsConf.of([])
    ];
    return extensions;
  }

  protected _dispatch_effects(effects: StateEffect<unknown> | readonly StateEffect<unknown>[]) {
    return this.#view?.dispatch({ effects });
  }

  /**
   * `language` / `languages` 输入变化后的语言同步。
   *
   * CEA-006：早先只要 `languages` 的**数组引用**变了就无条件 `setLanguage()`。
   * 父模板写 `[languages]="[myLang]"` 这类内联字面量时每轮变更检测都产生新数组，
   * 于是每轮都重新 `load()` 并 reconfigure 语言 Compartment ——
   * 大文档等于每次输入都整篇重新词法分析，自定义异步 loader 还会多发请求。
   * 判定基准改成「当前语言实际解析到的 description identity」，与 React / Vue 同构。
   */
  #syncLanguage() {
    const language = this.language();
    const resolved = resolveCodeEditorLanguage(language, this.languages());
    if (isSameResolvedLanguage(this.#appliedLanguage, resolved)) return;
    this.setLanguage(language);
  }

  /**
   * 把无障碍属性写到真正承担 `role="textbox"` 的 `.cm-content` 上。
   *
   * CEA-008 / CER-006：只在宿主 `div` 上补 `aria-*` 是把缺陷换个位置 —— 屏幕阅读器
   * 进到 textbox 之后读到的仍然是一个没有可访问名称、只报 `aria-readonly` 的多行文本框。
   * 属性字典由核心包计算，三端共用同一份实现。
   */
  #syncContentAttributes() {
    this._dispatch_effects(this.#contentAttributesEffect(this.#effectiveDisabled()));
  }

  #contentAttributesEffect(disabled: boolean): StateEffect<unknown> {
    const attributes = buildCodeEditorContentAttributes({
      describedBy: this.describedBy(),
      disabled,
      label: this.label(),
      labelledBy: this.labelledBy()
    });
    return this.#a11yConf.reconfigure(EditorView.contentAttributes.of(attributes));
  }

  #syncAccessState() {
    const disabled = this.#effectiveDisabled();
    const readonly = this.readonly();
    // CEA-004：三个 Compartment 必须在**同一次** dispatch 里重配。早先是
    // readonly → editable → a11y 三次派发，中间两拍是「只读但仍标记可编辑」
    // 这种自相矛盾的状态，装了 updateListener 的插件全都看得见，还各自重算一遍。
    //
    // 禁用语义也要写给辅助技术：只配 readonly 的话 CodeMirror 只写出 `aria-readonly`，
    // 屏幕阅读器会把禁用控件读成「可编辑但当前只读」，用户以为解锁后就能输入。
    this._dispatch_effects([
      this.#readonlyConf.reconfigure(EditorState.readOnly.of(readonly || disabled)),
      this.#editableConf.reconfigure(EditorView.editable.of(!readonly && !disabled)),
      this.#contentAttributesEffect(disabled)
    ]);
  }

  /** 当前 `setup` 预设对应的扩展；`null` 预设为空数组。 */
  #setupExtension(): Extension {
    const setup = this.setup();
    if (setup === 'basic') return basicSetup;
    if (setup === 'minimal') return minimalSetup;
    return [];
  }

  /**
   * 把 `ControlValueAccessor` 收到的任意值规整成文档内容，见 {@link CodeEditor.writeValue}。
   *
   * @throws TypeError 值既不是字符串也不是 `null` / `undefined`
   */
  #normalizeFormValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    const actual = typeof value === 'object' ? (value.constructor?.name ?? 'object') : typeof value;
    throw new TypeError(
      `[@aiao/code-editor-angular] writeValue() 只接受 string | null | undefined，实际收到 ${actual}。` +
        '请检查绑定的 FormControl 初始值或 ngModel 表达式。'
    );
  }
}
