import type {
  CodeEditorLanguageDescription,
  CodeEditorLanguageError,
  CodeEditorLanguageSupport
} from '@aiao/code-editor';
import { computeMinimalDocumentChange } from '@aiao/code-editor';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor } from '@angular/forms';
import { indentWithTab, undoDepth } from '@codemirror/commands';
import { defaultHighlightStyle, indentUnit as indentUnitFacet, syntaxHighlighting } from '@codemirror/language';
import { Facet, StateEffect, Transaction } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CodeEditor } from '../code-editor';
import type { CodeEditorSetup, CodeEditorTheme } from '../index';

const languageMarker = Facet.define<string>();
/** 模拟消费者通过 `setExtensions()` 装进来的自定义扩展。 */
const customExtensionMarker = Facet.define<string>();

const createDeferredLanguage = (name: string) => {
  const deferred = Promise.withResolvers<CodeEditorLanguageSupport>();
  const load = vi.fn(() => deferred.promise);
  const description = {
    name,
    alias: [],
    extensions: [],
    filename: undefined,
    support: undefined,
    load
  } satisfies CodeEditorLanguageDescription;
  return {
    description,
    load,
    promise: deferred.promise,
    reject: deferred.reject,
    resolve: (marker: string) => deferred.resolve({ extension: languageMarker.of(marker) })
  };
};

const settle = async (promise: Promise<unknown>): Promise<void> => {
  await promise.catch(() => undefined);
  await Promise.resolve();
};

/**
 * 在扩展树里按**构造函数名**找出 ViewPlugin —— 刻意不用 `instanceof`，
 * 否则副本分裂时这里就先找不到，断言退化成「没找着」而不是「找到了但不同源」。
 */
const findViewPluginLike = (extension: unknown): unknown => {
  if (Array.isArray(extension)) {
    for (const child of extension) {
      const found = findViewPluginLike(child);
      if (found) return found;
    }
    return null;
  }
  if (typeof extension !== 'object' || extension === null) return null;
  if (extension.constructor.name.endsWith('ViewPlugin')) return extension;
  return 'inner' in extension ? findViewPluginLike(extension.inner) : null;
};

/** 比较两个 `x.y.z`；左 > 右 返回正数，相等返回 0。 */
const compareSemver = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) return delta;
  }
  return 0;
};

interface EditorHarness {
  readonly component: CodeEditor;
  readonly fixture: ComponentFixture<CodeEditor>;
  readonly view: EditorView;
}

const getView = (fixture: ComponentFixture<CodeEditor>): EditorView => {
  const editorElement = fixture.nativeElement.querySelector('.cm-editor') as HTMLElement | null;
  if (!editorElement) throw new Error('CodeMirror editor was not created');
  const view = EditorView.findFromDOM(editorElement);
  if (!view) throw new Error('CodeMirror view was not found');
  return view;
};

const createEditor = (inputs: Readonly<Record<string, unknown>> = {}): EditorHarness => {
  const fixture = TestBed.createComponent(CodeEditor);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return { component: fixture.componentInstance, fixture, view: getView(fixture) };
};

/**
 * 在 test 中模拟旧 `setValue()` 的行为：通过 `EditorView.dispatch()` 写入文档。
 *
 * @param view CM6 视图
 * @param value 新文档内容
 * @param external 是否标记为外部写入（不进 undo 历史）
 */
const dispatchValue = (view: EditorView, value: string, external = false) => {
  const changes = computeMinimalDocumentChange(view.state.doc.toString(), value);
  if (!changes) return;
  view.dispatch({
    changes,
    annotations: external ? [Transaction.addToHistory.of(false)] : undefined,
    scrollIntoView: false
  });
};

describe('CodeEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CodeEditor] }).compileComponents();
  });

  describe('值同步', () => {
    // CEA-001：`setValue(value, true)` 用 `{ from: 0, to: doc.length }` 整篇替换。
    // CodeMirror 会把落在替换区内的光标映射到区间起点，宿主保存 / 格式化 / 服务端回填
    // 或表单 `writeValue()` 一次，就把用户送回文档开头；
    // 且 `External` annotation 只被本组件的 update listener 用来阻止回调环路，
    // CodeMirror 的 history **不认识**它 —— 程序写入照样进 undo 栈。
    it('外部同步保留光标位置', () => {
      const { view } = createEditor({ language: 'plaintext', value: 'hello world' });
      view.dispatch({ selection: { anchor: 2 } });
      expect(view.state.selection.main.head).toBe(2);

      dispatchValue(view, 'hello worlds', true);

      expect(view.state.doc.toString()).toBe('hello worlds');
      expect(view.state.selection.main.head).toBe(2);
    });

    it('外部同步保留范围选区', () => {
      const { view } = createEditor({ language: 'plaintext', value: 'abcdefgh' });
      view.dispatch({ selection: { anchor: 2, head: 5 } });

      dispatchValue(view, 'abcdefgh-tail', true);

      expect(view.state.selection.main.anchor).toBe(2);
      expect(view.state.selection.main.head).toBe(5);
    });

    it('外部同步不得进入 undo 历史', () => {
      const { view } = createEditor({ language: 'plaintext', value: 'hello world' });
      expect(undoDepth(view.state)).toBe(0);

      dispatchValue(view, 'hello brave world', true);

      expect(view.state.doc.toString()).toBe('hello brave world');
      expect(undoDepth(view.state)).toBe(0);
    });

    // 反向守卫：用户自己的编辑必须照常入栈，否则「不进历史」会被实现成「历史全废」
    it('用户自己的编辑仍然进入 undo 历史', () => {
      const { view } = createEditor({ language: 'plaintext', value: 'start' });
      view.dispatch({ changes: { from: 5, insert: '!' } });

      expect(undoDepth(view.state)).toBe(1);
    });

    it('外部同步只改写变化区间', () => {
      const { view } = createEditor({ language: 'plaintext', value: 'hello world' });
      const touched: Array<{ from: number; to: number; insert: string }> = [];
      const original = view.dispatch.bind(view);
      view.dispatch = ((...specs: Parameters<EditorView['dispatch']>) => {
        for (const spec of specs) {
          const changes = (spec as { changes?: { from: number; to?: number; insert?: string } }).changes;
          if (changes)
            touched.push({ from: changes.from, to: changes.to ?? changes.from, insert: changes.insert ?? '' });
        }
        return original(...specs);
      }) as EditorView['dispatch'];

      dispatchValue(view, 'hello brave world', true);

      expect(touched).toEqual([{ from: 6, to: 6, insert: 'brave ' }]);
    });

    it('保留初始化前由 CVA 写入的值', () => {
      const fixture = TestBed.createComponent(CodeEditor);
      const component = fixture.componentInstance;
      const onChange = vi.fn();
      const aoChange = vi.fn();
      component.registerOnChange(onChange);
      component.aoChange.subscribe(aoChange);

      component.writeValue('form value');
      fixture.detectChanges();

      expect(getView(fixture).state.doc.toString()).toBe('form value');
      expect(onChange).not.toHaveBeenCalled();
      expect(aoChange).not.toHaveBeenCalled();
    });

    it('把初始化前的 null CVA 值规整为空字符串', () => {
      const fixture = TestBed.createComponent(CodeEditor);
      fixture.componentRef.setInput('value', 'input value');
      const accessor: ControlValueAccessor = fixture.componentInstance;

      accessor.writeValue(null);
      fixture.detectChanges();

      expect(getView(fixture).state.doc.toString()).toBe('');
    });

    it('外部 value 更新不触发变更回调或事件', () => {
      const { component, fixture, view } = createEditor();
      const onChange = vi.fn();
      const aoChange = vi.fn();
      component.registerOnChange(onChange);
      component.aoChange.subscribe(aoChange);

      fixture.componentRef.setInput('value', 'external value');
      fixture.detectChanges();

      expect(view.state.doc.toString()).toBe('external value');
      expect(onChange).not.toHaveBeenCalled();
      expect(aoChange).not.toHaveBeenCalled();
    });

    it('外部值与当前文档相同时不 dispatch', () => {
      const { fixture, view } = createEditor();
      dispatchValue(view, 'same value', true);
      const update = vi.fn();
      view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.updateListener.of(update)) });
      update.mockClear();

      fixture.componentRef.setInput('value', 'same value');
      fixture.detectChanges();

      expect(update).not.toHaveBeenCalled();
    });

    it('用户变更只广播一次', () => {
      const { component, view } = createEditor();
      const onChange = vi.fn();
      const aoChange = vi.fn();
      component.registerOnChange(onChange);
      component.aoChange.subscribe(aoChange);

      dispatchValue(view, 'user value');
      dispatchValue(view, 'user value');

      expect(view.state.doc.toString()).toBe('user value');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('user value');
      expect(aoChange).toHaveBeenCalledTimes(1);
      expect(aoChange).toHaveBeenCalledWith('user value');
    });
  });

  describe('表单状态与焦点', () => {
    it('只在 blur 时标记 touched', () => {
      const { component, view } = createEditor();
      const onTouched = vi.fn();
      const aoFocus = vi.fn();
      const aoBlur = vi.fn();
      component.registerOnTouched(onTouched);
      component.aoFocus.subscribe(aoFocus);
      component.aoBlur.subscribe(aoBlur);

      view.contentDOM.dispatchEvent(new FocusEvent('focus'));

      expect(onTouched).not.toHaveBeenCalled();
      expect(aoFocus).toHaveBeenCalledTimes(1);

      view.contentDOM.dispatchEvent(new FocusEvent('blur'));

      expect(onTouched).toHaveBeenCalledTimes(1);
      expect(aoBlur).toHaveBeenCalledTimes(1);
    });

    it.each(['disabled', 'readonly'] as const)('把裸 %s 属性转换为不可编辑状态', inputName => {
      const { view } = createEditor({ [inputName]: '' });

      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
    });

    it('把裸 autoFocus 属性转换为自动聚焦', () => {
      const { view } = createEditor({ autoFocus: '' });

      expect(view.hasFocus).toBe(true);
    });

    it('autoFocus 场景仍然广播首个 aoFocus', () => {
      const fixture = TestBed.createComponent(CodeEditor);
      fixture.componentRef.setInput('autoFocus', '');
      const aoFocus = vi.fn();
      fixture.componentInstance.aoFocus.subscribe(aoFocus);

      fixture.detectChanges();

      // 原实现先 `this.#view.focus()` 再 `contentDOM.addEventListener('focus', …)`：
      // 监听器注册时焦点事件已经派发完毕，autoFocus 的第一次聚焦对调用方永远不可见。
      // 焦点监听必须随初始 extensions 一起装配（`EditorView.domEventObservers`），
      // 与 Vue（`CodeEditor.vue:75-78`）一致。
      expect(getView(fixture).hasFocus).toBe(true);
      expect(aoFocus).toHaveBeenCalledTimes(1);
    });

    // CEA-008：承担 `role="textbox"` 的是 CodeMirror 动态生成的 `.cm-content`，
    // 不是 Angular 宿主元素。可访问名称与 disabled 语义都必须落在那个元素上，
    // 只在宿主上补属性等于把缺陷换个位置（CER-006 同理）。
    it('把 label / labelledBy / describedBy 写到真正承担 textbox role 的元素上', () => {
      const { view } = createEditor({ describedBy: 'hint-id', label: '代码输入', labelledBy: 'label-id' });

      // 前置：确认这个元素确实是 textbox，否则下面三条断言测的是个无关的 div
      expect(view.contentDOM.getAttribute('role')).toBe('textbox');
      expect(view.contentDOM.getAttribute('aria-label')).toBe('代码输入');
      expect(view.contentDOM.getAttribute('aria-labelledby')).toBe('label-id');
      expect(view.contentDOM.getAttribute('aria-describedby')).toBe('hint-id');
    });

    it('清空 label 时移除属性，而不是留一个空的 aria-label', () => {
      const { fixture, view } = createEditor({ label: '代码输入' });
      expect(view.contentDOM.getAttribute('aria-label')).toBe('代码输入');

      fixture.componentRef.setInput('label', '');
      fixture.detectChanges();

      expect(view.contentDOM.hasAttribute('aria-label')).toBe(false);
    });

    it.each([
      ['disabled 输入', (harness: EditorHarness) => harness.fixture.componentRef.setInput('disabled', true)],
      ['CVA setDisabledState', (harness: EditorHarness) => harness.component.setDisabledState(true)]
    ])('%s 生效时把 disabled 语义告诉辅助技术，而不是只报 readonly', (_name, disable) => {
      const harness = createEditor();
      expect(harness.view.contentDOM.hasAttribute('aria-disabled')).toBe(false);

      disable(harness);
      harness.fixture.detectChanges();

      // readonly facet 让 CodeMirror 写出 aria-readonly，但「只读」和「禁用」不是一回事：
      // 屏幕阅读器会把禁用控件读成「可编辑但当前只读」，用户以为解锁后就能输入。
      expect(harness.view.contentDOM.getAttribute('aria-disabled')).toBe('true');
      expect(harness.fixture.nativeElement.getAttribute('aria-disabled')).toBe('true');
    });

    it.each(['disabled', 'readonly'] as const)('%s 时跳过 autoFocus，键盘焦点不落进不可编辑的编辑器', inputName => {
      const fixture = TestBed.createComponent(CodeEditor);
      fixture.componentRef.setInput('autoFocus', true);
      fixture.componentRef.setInput(inputName, true);
      const aoFocus = vi.fn();
      fixture.componentInstance.aoFocus.subscribe(aoFocus);

      fixture.detectChanges();

      expect(getView(fixture).hasFocus).toBe(false);
      expect(aoFocus).not.toHaveBeenCalled();
    });

    it('保留初始化前由 CVA 设置的 disabled 状态', () => {
      const fixture = TestBed.createComponent(CodeEditor);
      fixture.componentInstance.setDisabledState(true);

      fixture.detectChanges();
      const view = getView(fixture);

      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
    });
  });

  describe('异步语言加载', () => {
    it('只允许最后一次语言请求生效', async () => {
      const slow = createDeferredLanguage('Slow');
      const fast = createDeferredLanguage('Fast');
      const { fixture, view } = createEditor({
        language: 'slow',
        languages: [slow.description, fast.description]
      });

      fixture.componentRef.setInput('language', 'fast');
      fixture.detectChanges();
      fast.resolve('fast');
      await settle(fast.promise);

      expect(view.state.facet(languageMarker)).toEqual(['fast']);

      slow.resolve('slow');
      await settle(slow.promise);

      expect(view.state.facet(languageMarker)).toEqual(['fast']);
    });

    it('切换到 plaintext 时清除语言并使旧请求失效', async () => {
      const slow = createDeferredLanguage('Slow');
      const { fixture, view } = createEditor({ language: 'slow', languages: [slow.description] });

      fixture.componentRef.setInput('language', 'plaintext');
      fixture.detectChanges();

      expect(view.state.facet(languageMarker)).toEqual([]);

      slow.resolve('slow');
      await settle(slow.promise);

      expect(view.state.facet(languageMarker)).toEqual([]);
    });

    it('清空 languages 时清除语言并使旧请求失效', async () => {
      const slow = createDeferredLanguage('Slow');
      const { fixture, view } = createEditor({ language: 'slow', languages: [slow.description] });

      fixture.componentRef.setInput('languages', []);
      fixture.detectChanges();

      slow.resolve('slow');
      await settle(slow.promise);

      expect(view.state.facet(languageMarker)).toEqual([]);
    });

    it('同一轮 language 与 languages 更新只加载一次', () => {
      const language = createDeferredLanguage('Single');
      const { fixture } = createEditor();

      fixture.componentRef.setInput('language', 'single');
      fixture.componentRef.setInput('languages', [language.description]);
      fixture.detectChanges();

      expect(language.load).toHaveBeenCalledTimes(1);
    });

    // CEA-006：`ngOnChanges` 只看 `languages` 的**数组引用**变了就重新 `setLanguage()`。
    // 父模板写 `[languages]="[myLang]"` 这类内联字面量时每轮变更检测都产生新数组，
    // 于是每轮都重新 `load()` 并 reconfigure 语言 Compartment —— 大文档等于每次输入重新词法分析。
    // 判定基准应当是「当前语言实际解析到的 description identity」，而不是容器 identity。
    it('等价的新 languages 数组不重复加载当前语言', async () => {
      const stable = createDeferredLanguage('Stable');
      const { fixture, view } = createEditor({ language: 'stable', languages: [stable.description] });
      stable.resolve('stable');
      await settle(stable.promise);

      // 先钉住 arrange：没有这一步，下面的「没多加载」会在「压根没加载过」时也成立。
      expect(stable.load).toHaveBeenCalledTimes(1);
      expect(view.state.facet(languageMarker)).toEqual(['stable']);

      // 内容逐项相同、仅容器不同的新数组。
      fixture.componentRef.setInput('languages', [stable.description]);
      fixture.detectChanges();
      await settle(stable.promise);

      expect(stable.load).toHaveBeenCalledTimes(1);
      expect(view.state.facet(languageMarker)).toEqual(['stable']);
    });

    it('languages 换掉未选中的项时也不重复加载当前语言', async () => {
      const stable = createDeferredLanguage('Stable');
      const other = createDeferredLanguage('Other');
      const { fixture } = createEditor({
        language: 'stable',
        languages: [stable.description, other.description]
      });
      stable.resolve('stable');
      await settle(stable.promise);
      expect(stable.load).toHaveBeenCalledTimes(1);

      // 只换掉没被选中的那一项：当前语言解析到的还是同一个 description。
      fixture.componentRef.setInput('languages', [stable.description, createDeferredLanguage('Other').description]);
      fixture.detectChanges();
      await settle(stable.promise);

      expect(stable.load).toHaveBeenCalledTimes(1);
    });

    it('languages 换掉当前选中的项时必须重新加载', async () => {
      const first = createDeferredLanguage('Custom');
      const second = createDeferredLanguage('Custom');
      const { fixture, view } = createEditor({ language: 'custom', languages: [first.description] });
      first.resolve('first');
      await settle(first.promise);
      expect(view.state.facet(languageMarker)).toEqual(['first']);

      // 同名但**不同实例**：解析到的 description identity 变了，必须重新加载。
      fixture.componentRef.setInput('languages', [second.description]);
      fixture.detectChanges();
      second.resolve('second');
      await settle(second.promise);

      expect(second.load).toHaveBeenCalledTimes(1);
      expect(view.state.facet(languageMarker)).toEqual(['second']);
    });

    it('销毁后语言请求完成也不 dispatch', async () => {
      const slow = createDeferredLanguage('Slow');
      const { fixture, view } = createEditor({ language: 'slow', languages: [slow.description] });
      const dispatch = vi.spyOn(view, 'dispatch');

      fixture.destroy();
      dispatch.mockClear();
      slow.resolve('slow');
      await settle(slow.promise);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  // CEA-002：`/code-editor` 页面语法高亮整体消失（文本能编辑、行号还在，只是全成一个颜色）。
  // 根因不在组件而在依赖解析：`@codemirror/language` 被 pnpm 装了一份自己的
  // 嵌套 `@codemirror/view`，于是页面里同时存在两份 view。`syntaxHighlighting()`
  // 返回的 `treeHighlighter` 是 A 份的 `ViewPlugin`，注册进 A 份的 `viewPlugin` facet；
  // 组件 new 出来的 `EditorView` 是 B 份，只读 B 份的 facet —— 插件永远不被实例化，
  // 装饰集为空，**不报错**。同理波及 `bracketMatching` / `foldGutter` 等所有
  // 出自 `@codemirror/language` 的 ViewPlugin。
  // 因此这里两条都要测：单例（根因）+ 真的染上色（症状）。
  describe('语法高亮', () => {
    it('@codemirror/view 全局只有一份实例', () => {
      const plugin = findViewPluginLike(syntaxHighlighting(defaultHighlightStyle));

      // 先确认真的找到了 treeHighlighter，否则下一条断言会因为「没找着」而假绿。
      expect(plugin).not.toBeNull();
      // 跨副本时 `constructor.name` 仍是 ViewPlugin，但 `instanceof` 必然为 false ——
      // 这正是「颜色没了却一声不吭」的判据。
      expect(plugin).toBeInstanceOf(ViewPlugin);
    });

    it('渲染 SQL 关键字的高亮 token', async () => {
      const { view } = createEditor({ language: 'sql', value: 'select * from user;' });
      await vi.waitFor(() => {
        if (!view.dom.querySelector('.cm-content span[class]')) throw new Error('高亮未就绪');
      });

      const tokens = [...view.dom.querySelectorAll<HTMLElement>('.cm-content span[class]')];

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.map(token => token.textContent)).toContain('select');
    });

    it('plaintext 不产生任何高亮 token', async () => {
      const { view } = createEditor({ language: 'plaintext', value: 'select * from user;' });
      await settle(Promise.resolve());

      expect(view.dom.querySelectorAll('.cm-content span[class]')).toHaveLength(0);
    });
  });

  describe('setup 与输入重配置', () => {
    it('切换 setup 时保留其他配置并实际应用新 setup', async () => {
      const language = createDeferredLanguage('Configured');
      const { component, fixture, view } = createEditor({
        language: 'configured',
        languages: [language.description],
        lineWrapping: true,
        placeholder: 'write code',
        readonly: true,
        setup: 'basic',
        theme: 'dark'
      });
      const onChange = vi.fn();
      component.registerOnChange(onChange);
      language.resolve('configured');
      await settle(language.promise);

      expect(fixture.nativeElement.querySelector('.cm-lineNumbers')).not.toBeNull();

      fixture.componentRef.setInput('setup', 'minimal');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.cm-lineNumbers')).toBeNull();
      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
      expect(view.state.facet(EditorView.darkTheme)).toBe(true);
      expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
      expect(fixture.nativeElement.querySelector('.cm-placeholder')?.textContent).toBe('write code');
      expect(view.state.facet(languageMarker)).toEqual(['configured']);

      dispatchValue(view, 'after setup');
      expect(onChange).toHaveBeenCalledWith('after setup');
    });

    it('动态更新并清除可重配置输入', () => {
      const { fixture, view } = createEditor({ setup: null });

      fixture.componentRef.setInput('highlightWhitespace', true);
      fixture.componentRef.setInput('indentUnit', '    ');
      fixture.componentRef.setInput('indentWithTab', true);
      fixture.componentRef.setInput('lineWrapping', true);
      fixture.componentRef.setInput('placeholder', 'type here');
      fixture.componentRef.setInput('theme', 'dark');
      fixture.detectChanges();

      expect(view.state.facet(EditorView.darkTheme)).toBe(true);
      expect(view.state.facet(indentUnitFacet)).toBe('    ');
      expect(view.state.facet(keymap).flat()).toContain(indentWithTab);
      expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
      expect(fixture.nativeElement.querySelector('.cm-placeholder')?.textContent).toBe('type here');

      dispatchValue(view, 'a b', true);
      expect(fixture.nativeElement.querySelector('.cm-highlightSpace')).not.toBeNull();

      fixture.componentRef.setInput('highlightWhitespace', false);
      fixture.componentRef.setInput('indentUnit', '');
      fixture.componentRef.setInput('indentWithTab', false);
      fixture.componentRef.setInput('lineWrapping', false);
      fixture.componentRef.setInput('placeholder', '');
      fixture.componentRef.setInput('theme', 'light');
      fixture.detectChanges();

      expect(view.state.facet(EditorView.darkTheme)).toBe(false);
      expect(view.state.facet(indentUnitFacet)).toBe('  ');
      expect(view.state.facet(keymap).flat()).not.toContain(indentWithTab);
      expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
      expect(fixture.nativeElement.querySelector('.cm-highlightSpace')).toBeNull();
      expect(fixture.nativeElement.querySelector('.cm-placeholder')).toBeNull();
    });

    it('把显式 root 传给 EditorView', () => {
      const root = document.createElement('div').attachShadow({ mode: 'open' });
      const { view } = createEditor({ root });

      expect(view.root).toBe(root);
    });
  });

  describe('三端对称：默认值与错误信息', () => {
    it('language 默认值与 React/Vue 一样是 sql', () => {
      const sql = createDeferredLanguage('SQL');
      const { component } = createEditor({ languages: [sql.description] });

      // React `CodeEditor.tsx:76` 与 Vue `CodeEditor.vue:24` 都默认 'sql'，Angular 原本是 ''：
      // 同一段 <ao-code-editor> 在三端拿到的高亮不一致，违反「三框架 API 必须对称」铁律
      expect(component.language()).toBe('sql');
      expect(sql.load).toHaveBeenCalledTimes(1);
    });

    it('indentUnit 默认值与 React/Vue 一样是两个空格', () => {
      const { component, view } = createEditor();

      expect(component.indentUnit()).toBe('  ');
      // 声明值从 '' 改为 '  ' 不改变运行时行为：CodeMirror 自身的 indentUnit 默认就是两个空格
      // （见「动态更新并清除可重配置输入」里 indentUnit='' 读到 '  ' 的断言），
      // 因此这是纯粹的 API 对称性修正
      expect(view.state.facet(indentUnitFacet)).toBe('  ');
    });

    it('语言缺失与加载失败的日志与 React/Vue 逐字一致', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const broken = createDeferredLanguage('Broken');
      const { fixture } = createEditor({ language: 'missing', languages: [broken.description] });

      // React `CodeEditor.spec.tsx:215` 与 Vue `CodeEditor.spec.ts:517` 已锁死这两条字面量，
      // Angular 原本是无前缀的 `Language "missing" not found. Supported: …`
      expect(error).toHaveBeenCalledWith("[CodeEditor] Language 'missing' not found.");

      fixture.componentRef.setInput('language', 'broken');
      fixture.detectChanges();
      const failure = new Error('load failed');
      broken.reject(failure);
      await settle(broken.promise);

      expect(error).toHaveBeenCalledWith("[CodeEditor] Failed to load language 'broken':", failure);
      error.mockRestore();
    });
  });

  // CEA-009：Angular 端把 11 个 `setXxx()` 全部暴露成公开方法，React / Vue 只暴露
  // `view` / `host` / `focus()` / `blur()` —— 同一份 API 文档在三端讲的不是一件事。
  // 收敛方向：三端统一到这四个成员，Angular 的旧 setter 保留但标 `@deprecated`。
  describe('命令式 handle（三端对称）', () => {
    it('暴露 view / host / focus / blur', () => {
      const { component, fixture, view } = createEditor();

      expect(component.view).toBe(view);
      expect(component.host).toBe(fixture.nativeElement);

      component.focus();
      expect(view.hasFocus).toBe(true);

      component.blur();
      expect(view.hasFocus).toBe(false);
    });

    it('销毁后 view 与 host 都是 null，与 React / Vue 一致', () => {
      const { component, fixture } = createEditor();
      fixture.destroy();

      expect(component.view).toBeNull();
      expect(component.host).toBeNull();
    });

    it('未初始化时 focus / blur 是安全的空操作', () => {
      const fixture = TestBed.createComponent(CodeEditor);
      const component = fixture.componentInstance;

      expect(() => {
        component.focus();
        component.blur();
      }).not.toThrow();
      expect(component.view).toBeNull();
    });
  });

  describe('样式、文档与公共类型', () => {
    // CEA-002：peer 写 `"@aiao/code-editor": "*"`，而本包生成的 .d.ts 引用了核心包里
    // 较新版本才有的类型（`CodeEditorLanguageDescription` / `ResolvedCodeEditorLanguage` /
    // `CodeEditorLanguageError`）。消费者装上任一旧版核心包，安装成功、编译却炸。
    // 根因是门禁只验证工作区源码、从不验证「peer 范围允许的组合」，这条用例守住漂移的入口：
    // 核心包一加新导出，peer 下界必须跟着抬。
    it('peer 声明的核心包下界不低于工作区版本', () => {
      const own = JSON.parse(readFileSync('package.json', 'utf8')) as {
        peerDependencies: Record<string, string>;
      };
      const core = JSON.parse(readFileSync('../code-editor/package.json', 'utf8')) as { version: string };
      const range = own.peerDependencies['@aiao/code-editor'];
      const lowerBound = /^>=\s*(\d+\.\d+\.\d+)$/.exec(range)?.[1];

      expect(lowerBound, `peer 范围必须写成 ">=x.y.z"，当前是 "${range}"`).toBeDefined();
      expect(compareSemver(lowerBound!, core.version)).toBeGreaterThanOrEqual(0);
    });

    it('不覆盖 lineWrapping 并保留可见焦点环', () => {
      const styles = readFileSync('src/code-editor.scss', 'utf8');

      expect(styles).not.toContain('white-space: pre-wrap');
      expect(styles).not.toContain('outline: none');
      expect(styles).toContain('.cm-editor.cm-focused');
      expect(styles).toMatch(/outline:\s*2px\s+solid/);
    });

    it('README 使用实际 standalone API 与 selector', () => {
      const readme = readFileSync('README.md', 'utf8');

      expect(readme).toContain("import { CodeEditor } from '@aiao/code-editor-angular';");
      expect(readme).toContain("import { FormsModule } from '@angular/forms';");
      expect(readme).toContain('<ao-code-editor');
      expect(readme).not.toContain('CodeEditorModule');
      expect(readme).not.toContain('<aiao-code-editor');
    });

    it('导出稳定的 setup 与 theme 公共类型', () => {
      expectTypeOf<CodeEditorSetup>().toEqualTypeOf<'basic' | 'minimal' | null>();
      expectTypeOf<CodeEditorTheme>().toEqualTypeOf<'light' | 'dark'>();
    });
  });

  // onChange / onTouched 只能经 registerOnChange / registerOnTouched 注入；
  // 暴露成公开字段时消费者可以直接覆盖，静默切断表单双向绑定。
  // useDisabled 是内部 linkedSignal，外部 .set() 写了也不会同步到编辑器（set 不触发副作用）。
  describe('公开成员边界', () => {
    it('不把表单回调与内部 signal 暴露为公开成员', () => {
      const { component } = createEditor();
      const instance = component as unknown as Record<string, unknown>;

      expect('onChange' in instance).toBe(false);
      expect('onTouched' in instance).toBe(false);
      expect('useDisabled' in instance).toBe(false);
    });

    it('registerOnChange 注入的回调仍然生效', () => {
      const { component, view } = createEditor();
      const onChange = vi.fn();
      component.registerOnChange(onChange);

      view.dispatch({ changes: { from: 0, insert: 'typed' } });

      expect(onChange).toHaveBeenCalledWith('typed');
    });

    it('setDisabledState 仍然同步到编辑器', () => {
      const { component, view } = createEditor();

      component.setDisabledState(true);

      expect(view.state.readOnly).toBe(true);
    });
  });

  // CEA-004：`disabled` input 与表单的 `setDisabledState()` 被压进同一个 `linkedSignal`，
  // 成了「最后写的赢」。两条来源是**独立的事实**：模板说「这个控件永远禁用」，
  // 表单说「这个 FormControl 当前 disable 了」，任一为真就该禁用。
  describe('disabled 的两条来源', () => {
    it('表单 enable 不得推翻 disabled 输入', () => {
      const { component, fixture, view } = createEditor({ disabled: true });
      expect(view.state.readOnly).toBe(true);

      // Reactive Forms 在控件处于 enabled 时会主动调 setDisabledState(false)。
      component.setDisabledState(false);
      fixture.detectChanges();

      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
      expect(view.contentDOM.getAttribute('aria-disabled')).toBe('true');
    });

    it('disabled 输入回落 false 不得丢掉表单侧的禁用', () => {
      const { component, fixture, view } = createEditor({ disabled: true });
      component.setDisabledState(true);

      fixture.componentRef.setInput('disabled', false);
      fixture.detectChanges();

      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
    });

    it('两条来源都放开后才恢复可编辑', () => {
      const { component, fixture, view } = createEditor({ disabled: true });
      component.setDisabledState(true);

      component.setDisabledState(false);
      fixture.componentRef.setInput('disabled', false);
      fixture.detectChanges();

      expect(view.state.readOnly).toBe(false);
      expect(view.state.facet(EditorView.editable)).toBe(true);
      expect(view.contentDOM.hasAttribute('aria-disabled')).toBe(false);
    });

    it('禁用状态在一次事务内落地，插件观察不到中间态', () => {
      // 用 plaintext 免掉异步语言加载 —— 它会在断言之后再发一次 reconfigure，
      // 而 `seen` 是活引用，vitest 的 diff 是报错时才序列化的，混进来只会让诊断更难读。
      const { component, view } = createEditor({ language: 'plaintext' });
      const seen: Array<{ editable: boolean; readOnly: boolean }> = [];
      view.dispatch({
        effects: StateEffect.appendConfig.of(
          EditorView.updateListener.of(update => {
            seen.push({ editable: update.state.facet(EditorView.editable), readOnly: update.state.readOnly });
          })
        )
      });
      // 安装监听器那一拍自己也会被它看到，不属于被测行为。
      seen.length = 0;

      component.setDisabledState(true);

      // 旧实现分三次 dispatch（readonly → editable → a11y），中间两拍是
      // 「只读但仍可编辑」这种自相矛盾的状态，装了 updateListener 的插件全都看得见。
      expect(seen).toEqual([{ editable: false, readOnly: true }]);
    });
  });

  // CEA-005：`writeValue(value: string | null)` 的签名是假的 —— CVA 的契约是 `any`，
  // Angular 不做运行时校验。宿主 FormControl 里放个 number，初始化前进 `#pendingValue`
  // 后在 `EditorState.create` 处炸，初始化后又在别处炸，两个时机两种错。
  describe('writeValue 的类型校验', () => {
    const invalidValues = [
      { label: 'number', value: 42, type: 'number' },
      { label: 'object', value: { a: 1 }, type: 'Object' },
      { label: 'array', value: ['a'], type: 'Array' },
      { label: 'boolean', value: true, type: 'boolean' }
    ] as const;

    it.each(invalidValues)('初始化后收到 $label 抛 TypeError', ({ value, type }) => {
      const { component } = createEditor();
      const accessor: ControlValueAccessor = component;

      expect(() => accessor.writeValue(value)).toThrow(TypeError);
      expect(() => accessor.writeValue(value)).toThrow(
        expect.objectContaining({ message: expect.stringContaining(type) })
      );
    });

    it.each(invalidValues)('初始化前收到 $label 抛同一个 TypeError', ({ value, type }) => {
      const fixture = TestBed.createComponent(CodeEditor);
      const accessor: ControlValueAccessor = fixture.componentInstance;

      expect(() => accessor.writeValue(value)).toThrow(TypeError);
      expect(() => accessor.writeValue(value)).toThrow(
        expect.objectContaining({ message: expect.stringContaining(type) })
      );
    });

    it('错误信息指明包名，宿主能定位到是哪个控件', () => {
      const { component } = createEditor();

      expect(() => (component as ControlValueAccessor).writeValue(42)).toThrow(/@aiao\/code-editor-angular/);
    });

    it.each([
      { label: 'null', value: null },
      { label: 'undefined', value: undefined }
    ])('$label 仍然规整成空串（既有契约）', ({ value }) => {
      const { fixture, view } = createEditor({ value: 'seed' });

      (fixture.componentInstance as ControlValueAccessor).writeValue(value);

      expect(view.state.doc.toString()).toBe('');
    });
  });

  // CEA-003：`setExtensions()` 走的是全局 `StateEffect.reconfigure`，
  // 它替换的是**整棵扩展树** —— 一次调用就清掉 updateListener、全部 Compartment、
  // 主题、语言、a11y 属性。名字叫「设置扩展」，实际是「摧毁编辑器配置」。
  describe('setExtensions 只替换消费者扩展', () => {
    it('保留 setup、主题、只读、语言与变更回调', async () => {
      const language = createDeferredLanguage('Configured');
      const { component, fixture, view } = createEditor({
        language: 'configured',
        languages: [language.description],
        readonly: true,
        setup: 'basic',
        theme: 'dark'
      });
      const onChange = vi.fn();
      const aoChange = vi.fn();
      component.registerOnChange(onChange);
      component.aoChange.subscribe(aoChange);
      language.resolve('configured');
      await settle(language.promise);

      component.setExtensions([customExtensionMarker.of('user-extension')]);

      expect(view.state.facet(customExtensionMarker)).toEqual(['user-extension']);
      expect(view.state.readOnly).toBe(true);
      expect(view.state.facet(EditorView.editable)).toBe(false);
      expect(view.state.facet(EditorView.darkTheme)).toBe(true);
      expect(view.state.facet(languageMarker)).toEqual(['configured']);
      expect(fixture.nativeElement.querySelector('.cm-lineNumbers')).not.toBeNull();

      view.dispatch({ changes: { from: 0, insert: 'typed' } });
      expect(onChange).toHaveBeenCalledWith('typed');
      expect(aoChange).toHaveBeenCalledWith('typed');
    });

    it('再次调用替换掉上一批消费者扩展', () => {
      const { component, view } = createEditor({ setup: null });

      component.setExtensions([customExtensionMarker.of('first')]);
      component.setExtensions([customExtensionMarker.of('second')]);

      expect(view.state.facet(customExtensionMarker)).toEqual(['second']);
    });

    it('setup 变化不清掉消费者扩展', () => {
      const { component, fixture, view } = createEditor({ setup: 'basic' });
      component.setExtensions([customExtensionMarker.of('user-extension')]);

      fixture.componentRef.setInput('setup', 'minimal');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.cm-lineNumbers')).toBeNull();
      expect(view.state.facet(customExtensionMarker)).toEqual(['user-extension']);
    });
  });

  // CEA-007：语言查不到或 load() rejected 时只有一条 console.error，然后静默退回纯文本。
  // 宿主应用完全观测不到 —— 拿不到错误、没有重试或降级的机会。
  describe('aoLanguageError 结构化错误通道', () => {
    const createErrorHarness = (inputs: Readonly<Record<string, unknown>>) => {
      const fixture = TestBed.createComponent(CodeEditor);
      for (const [name, value] of Object.entries(inputs)) {
        fixture.componentRef.setInput(name, value);
      }
      const errors: CodeEditorLanguageError[] = [];
      fixture.componentInstance.aoLanguageError.subscribe(error => errors.push(error));
      fixture.detectChanges();
      return { component: fixture.componentInstance, errors, fixture };
    };

    it('语言查不到时发出 not-found 载荷', () => {
      const known = createDeferredLanguage('Known');
      const { errors } = createErrorHarness({ language: 'nope', languages: [known.description] });

      expect(errors).toEqual([
        { kind: 'not-found', language: 'nope', message: "Language 'nope' not found.", cause: undefined }
      ]);
    });

    it('load() rejected 时发出 load-failed 载荷并原样透传 cause', async () => {
      const broken = createDeferredLanguage('Broken');
      const failure = new Error('offline');
      const { errors } = createErrorHarness({ language: 'broken', languages: [broken.description] });

      broken.reject(failure);
      await settle(broken.promise);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        kind: 'load-failed',
        language: 'broken',
        message: "Failed to load language 'broken'."
      });
      expect(errors[0].cause).toBe(failure);
    });

    it('plaintext 与加载成功都不发事件', async () => {
      const ok = createDeferredLanguage('Ok');
      const { errors, fixture } = createErrorHarness({ language: 'ok', languages: [ok.description] });

      ok.resolve('ok');
      await settle(ok.promise);
      fixture.componentRef.setInput('language', 'plaintext');
      fixture.detectChanges();

      expect(errors).toEqual([]);
    });

    it('过期请求的失败不发事件，只有最后一次请求能报告', async () => {
      const slow = createDeferredLanguage('Slow');
      const fast = createDeferredLanguage('Fast');
      const { errors, fixture } = createErrorHarness({
        language: 'slow',
        languages: [slow.description, fast.description]
      });

      fixture.componentRef.setInput('language', 'fast');
      fixture.detectChanges();
      slow.reject(new Error('stale'));
      await settle(slow.promise);

      expect(errors).toEqual([]);
    });

    it('销毁后到达的失败不发事件', async () => {
      const broken = createDeferredLanguage('Broken');
      const { errors, fixture } = createErrorHarness({ language: 'broken', languages: [broken.description] });

      fixture.destroy();
      broken.reject(new Error('too late'));
      await settle(broken.promise);

      expect(errors).toEqual([]);
    });
  });
});
