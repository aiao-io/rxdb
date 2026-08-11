import type { CodeEditorLanguageError } from '@aiao/code-editor';
import { undoDepth } from '@codemirror/commands';
import {
  defaultHighlightStyle,
  getIndentUnit,
  indentUnit as indentUnitFacet,
  LanguageDescription,
  language as languageFacet,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language';
import { EditorView, runScopeHandlers, ViewPlugin } from '@codemirror/view';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor, type CodeEditorHandle } from '../CodeEditor';

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason: Error) => void;
  resolve: (value: T) => void;
}

const createDeferred = <T,>(): Deferred<T> => {
  let rejectPromise: (reason: Error) => void = () => undefined;
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
};

const createLanguageSupport = (): LanguageSupport =>
  new LanguageSupport(
    StreamLanguage.define<null>({
      startState: () => null,
      token(stream) {
        stream.skipToEnd();
        return null;
      }
    })
  );

const findView = (container: HTMLElement): EditorView => {
  const content = container.querySelector<HTMLElement>('.cm-content');
  if (!content) throw new Error('CodeMirror content was not created');
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error('CodeMirror view was not found');
  return view;
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CodeEditor', () => {
  it('renders a real editor, emits local changes, syncs external values, and destroys the view', () => {
    const firstOnChange = vi.fn();
    const secondOnChange = vi.fn();
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const result = render(<CodeEditor language='plaintext' onChange={firstOnChange} value='initial' />);
    const view = findView(result.container);

    expect(view.state.doc.toString()).toBe('initial');
    expect(result.container.querySelector('.cm-lineNumbers')).not.toBeNull();

    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'local' } });
    });
    expect(firstOnChange).toHaveBeenCalledWith('local');

    firstOnChange.mockClear();
    result.rerender(<CodeEditor language='plaintext' onChange={secondOnChange} value='external' />);
    expect(view.state.doc.toString()).toBe('external');
    expect(firstOnChange).not.toHaveBeenCalled();
    expect(secondOnChange).not.toHaveBeenCalled();

    act(() => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'latest' } });
    });
    expect(firstOnChange).not.toHaveBeenCalled();
    expect(secondOnChange).toHaveBeenCalledWith('latest');

    result.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  // `from: 0, to: len` 是整篇替换：CodeMirror 把落在被替换区间内的选区映射到区间起点，
  // 光标无条件跳到文档开头。任何「父组件异步/防抖回写 value」的受控用法（格式化、协同、
  // 服务端回填、useDeferredValue）都会把用户正在编辑的位置弹走。
  it('keeps the caret position when an external value append arrives', () => {
    const result = render(<CodeEditor language='plaintext' value='hello world' />);
    const view = findView(result.container);

    act(() => {
      view.dispatch({ selection: { anchor: 2 } });
    });
    expect(view.state.selection.main.head).toBe(2);

    result.rerender(<CodeEditor language='plaintext' value='hello worlds' />);

    expect(view.state.doc.toString()).toBe('hello worlds');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('keeps the caret position when an external value edit lands after the caret', () => {
    const result = render(<CodeEditor language='plaintext' value='abc def' />);
    const view = findView(result.container);

    act(() => {
      view.dispatch({ selection: { anchor: 3 } });
    });

    result.rerender(<CodeEditor language='plaintext' value='abc xyz' />);

    expect(view.state.doc.toString()).toBe('abc xyz');
    expect(view.state.selection.main.head).toBe(3);
  });

  // 整篇替换还会往 undo 历史里塞一条「全文替换」，Ctrl+Z 会一次性回退全部内容
  it('rewrites only the changed span when syncing an external value', () => {
    const result = render(<CodeEditor language='plaintext' value='hello world' />);
    const view = findView(result.container);
    const touched: Array<{ from: number; to: number; inserted: string }> = [];
    const dispatch = vi.spyOn(view, 'dispatch').mockImplementation((...specs) => {
      for (const spec of specs) {
        const changes = (spec as { changes?: { from: number; to?: number; insert?: string } }).changes;
        if (changes)
          touched.push({ from: changes.from, to: changes.to ?? changes.from, inserted: changes.insert ?? '' });
      }
      return EditorView.prototype.dispatch.apply(view, specs as never);
    });

    result.rerender(<CodeEditor language='plaintext' value='hello brave world' />);

    expect(view.state.doc.toString()).toBe('hello brave world');
    // 'hello ' 与 'world' 是公共前后缀，只有中间的插入点需要被改写
    expect(touched).toEqual([{ from: 6, to: 6, inserted: 'brave ' }]);
    dispatch.mockRestore();
  });

  // CER-001：最小差量只解决了光标问题。事务只带 `External` annotation，
  // 而 CodeMirror 的 history **不认识**它 —— 宿主回写仍然进 undo 栈，
  // 用户第一次 Ctrl+Z 会被送回「宿主同步之前」的内容，撤销结果不再代表自己的编辑。
  // 上面那条用例的注释声称覆盖了这一点，实际只检查 touched span，因此一直假绿。
  it('keeps host-driven value sync out of the undo history', () => {
    const result = render(<CodeEditor language='plaintext' value='hello world' />);
    const view = findView(result.container);

    expect(undoDepth(view.state)).toBe(0);

    result.rerender(<CodeEditor language='plaintext' value='hello brave world' />);

    expect(view.state.doc.toString()).toBe('hello brave world');
    expect(undoDepth(view.state)).toBe(0);
  });

  // 反向守卫：用户自己的编辑必须照常入栈，否则「不进历史」会被实现成「历史全废」。
  // 刻意不断言「用户编辑后再同步，depth 仍为 1」——CodeMirror 会把时间相近的事件并成一组，
  // 那条断言在修复前也会通过，是个假绿。
  it('still records the user own edits in the undo history', () => {
    const result = render(<CodeEditor language='plaintext' value='start' />);
    const view = findView(result.container);

    act(() => {
      view.dispatch({ changes: { from: 5, insert: '!' } });
    });

    expect(undoDepth(view.state)).toBe(1);
  });

  it('keeps a range selection intact across an external sync', () => {
    const result = render(<CodeEditor language='plaintext' value='abcdefgh' />);
    const view = findView(result.container);

    act(() => {
      view.dispatch({ selection: { anchor: 2, head: 5 } });
    });

    result.rerender(<CodeEditor language='plaintext' value='abcdefgh-tail' />);

    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(5);
  });

  it('defaults indentUnit to two spaces, matching the Angular and Vue bindings', () => {
    const result = render(<CodeEditor language='plaintext' value='' />);
    const view = findView(result.container);

    // 三端声明默认值统一为 '  '（Angular `code-editor.ts:110`、Vue `CodeEditor.vue:22`）。
    // React 原本不给默认值，靠 CodeMirror 自身的 2 空格兜底 —— 行为一致但 API 面不对称。
    // 这里锁的是可观测契约：不传 indentUnit 时缩进单位就是两个空格。
    expect(view.state.facet(indentUnitFacet)).toBe('  ');
    expect(getIndentUnit(view.state)).toBe(2);
  });

  it('reconfigures setup, theme, access, placeholder, indentation, wrapping, and whitespace', () => {
    const result = render(<CodeEditor language='plaintext' value='' />);
    const view = findView(result.container);

    expect(view.state.facet(EditorView.darkTheme)).toBe(false);
    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM.contentEditable).toBe('true');
    expect(result.container.querySelector('.cm-lineNumbers')).not.toBeNull();

    result.rerender(
      <CodeEditor
        disabled
        highlightWhitespace
        indentUnit='  '
        indentWithTab
        language='plaintext'
        lineWrapping
        placeholder='Write code'
        setup='minimal'
        theme='dark'
        value='a b'
      />
    );

    expect(view.state.facet(EditorView.darkTheme)).toBe(true);
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.contentEditable).toBe('false');
    expect(getIndentUnit(view.state)).toBe(2);
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);
    expect(result.container.querySelector('.cm-highlightSpace')).not.toBeNull();
    expect(result.container.querySelector('.cm-lineNumbers')).toBeNull();

    result.rerender(
      <CodeEditor
        indentUnit='  '
        indentWithTab
        language='plaintext'
        placeholder='Write code'
        setup='minimal'
        value=''
      />
    );

    expect(view.state.facet(EditorView.darkTheme)).toBe(false);
    expect(view.state.readOnly).toBe(false);
    expect(view.contentDOM.contentEditable).toBe('true');
    expect(result.container.querySelector('.cm-placeholder')?.textContent).toBe('Write code');

    act(() => {
      view.dispatch({ selection: { anchor: 0 } });
      const handled = runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Tab' }), 'editor');
      expect(handled).toBe(true);
    });
    expect(view.state.doc.toString()).toBe('  ');
  });

  it('loads no preset setup extensions when setup is null', () => {
    const result = render(<CodeEditor language='plaintext' setup={null} value='' />);
    const view = findView(result.container);

    act(() => {
      view.dispatch({ changes: { from: 0, insert: 'value' } });
    });

    expect(result.container.querySelector('.cm-lineNumbers')).toBeNull();
    expect(undoDepth(view.state)).toBe(0);
  });

  it('loads from a custom language list and reloads when the list changes', async () => {
    const firstSupport = createLanguageSupport();
    const secondSupport = createLanguageSupport();
    const firstLanguage = LanguageDescription.of({
      name: 'Custom',
      load: () => Promise.resolve(firstSupport)
    });
    const secondLanguage = LanguageDescription.of({
      name: 'Custom',
      load: () => Promise.resolve(secondSupport)
    });
    const result = render(<CodeEditor language='custom' languages={[firstLanguage]} value='value' />);
    const view = findView(result.container);

    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(firstSupport.language));

    result.rerender(<CodeEditor language='custom' languages={[secondLanguage]} value='value' />);
    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(secondSupport.language));
  });

  // languages 是数组，effect 依赖对它做 Object.is：消费者写内联字面量
  // `languages={[myLang]}` 时父组件每渲染一次就重新 load() + reconfigure 一次，
  // 语言 StateField 被重建 = 整篇文档重新词法分析，大文件下每次按键都全量重 parse。
  it('does not reconfigure the language when an equal list arrives in a new array', async () => {
    const support = createLanguageSupport();
    // LanguageDescription.load() 内部缓存 promise，重复调用不会再触达 loader，
    // 因此真正要观测的是「语言 compartment 被重新 reconfigure」——它才是整篇重新词法分析的动作。
    const custom = LanguageDescription.of({ name: 'Custom', load: () => Promise.resolve(support) });
    const result = render(<CodeEditor language='custom' languages={[custom]} value='value' />);
    const view = findView(result.container);

    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(support.language));

    const dispatch = vi.spyOn(view, 'dispatch');

    // 同一批描述符、每次都是新数组字面量 —— 语义上没有任何变化
    result.rerender(<CodeEditor language='custom' languages={[custom]} value='value' />);
    result.rerender(<CodeEditor language='custom' languages={[custom]} value='value' />);
    await act(async () => {
      await flushPromises();
    });

    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });

  // CEA-006 / CEV-003 的 React 对称面：上一条只覆盖「整份列表逐项相同」，
  // 而按元素身份判等仍会在**任何一项**变化时重配置 —— 哪怕变的那项根本没被选中。
  // 判定基准应当是「当前语言实际解析到的 description identity」。
  it('does not reconfigure the language when an unselected entry changes', async () => {
    const support = createLanguageSupport();
    const custom = LanguageDescription.of({ name: 'Custom', load: () => Promise.resolve(support) });
    const other = LanguageDescription.of({ name: 'Other', load: () => Promise.resolve(createLanguageSupport()) });
    const result = render(<CodeEditor language='custom' languages={[custom, other]} value='value' />);
    const view = findView(result.container);

    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(support.language));

    const dispatch = vi.spyOn(view, 'dispatch');

    // 只换掉没被选中的那一项。
    const replacement = LanguageDescription.of({ name: 'Other', load: () => Promise.resolve(createLanguageSupport()) });
    result.rerender(<CodeEditor language='custom' languages={[custom, replacement]} value='value' />);
    await act(async () => {
      await flushPromises();
    });

    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });

  it('does not reconfigure the language when the name changes to an alias of the same description', async () => {
    const support = createLanguageSupport();
    const custom = LanguageDescription.of({
      name: 'TypeScript',
      alias: ['ts'],
      load: () => Promise.resolve(support)
    });
    const result = render(<CodeEditor language='TypeScript' languages={[custom]} value='value' />);
    const view = findView(result.container);

    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(support.language));

    const dispatch = vi.spyOn(view, 'dispatch');

    result.rerender(<CodeEditor language='ts' languages={[custom]} value='value' />);
    await act(async () => {
      await flushPromises();
    });

    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });

  it('ignores a stale language load after the language changes', async () => {
    const slow = createDeferred<LanguageSupport>();
    const fastSupport = createLanguageSupport();
    const slowLanguage = LanguageDescription.of({ name: 'Slow', load: () => slow.promise });
    const fastLanguage = LanguageDescription.of({ name: 'Fast', load: () => Promise.resolve(fastSupport) });
    const languages = [slowLanguage, fastLanguage];
    const result = render(<CodeEditor language='slow' languages={languages} value='' />);
    const view = findView(result.container);

    result.rerender(<CodeEditor language='fast' languages={languages} value='' />);
    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(fastSupport.language));

    await act(async () => {
      slow.resolve(createLanguageSupport());
      await flushPromises();
    });
    expect(view.state.facet(languageFacet)).toBe(fastSupport.language);
  });

  it('clears language support for plaintext, empty lists, unknown languages, and load failures', async () => {
    const support = createLanguageSupport();
    const working = LanguageDescription.of({ name: 'Working', load: () => Promise.resolve(support) });
    const failure = new Error('load failed');
    const broken = LanguageDescription.of({ name: 'Broken', load: () => Promise.reject(failure) });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = render(<CodeEditor language='working' languages={[working, broken]} value='' />);
    const view = findView(result.container);

    await waitFor(() => expect(view.state.facet(languageFacet)).toBe(support.language));

    result.rerender(<CodeEditor language='plaintext' languages={[working, broken]} value='' />);
    expect(view.state.facet(languageFacet)).toBeNull();

    result.rerender(<CodeEditor language='working' languages={[]} value='' />);
    expect(view.state.facet(languageFacet)).toBeNull();

    result.rerender(<CodeEditor language='missing' languages={[working, broken]} value='' />);
    await waitFor(() => expect(error).toHaveBeenCalledWith("[CodeEditor] Language 'missing' not found."));
    expect(view.state.facet(languageFacet)).toBeNull();

    result.rerender(<CodeEditor language='broken' languages={[working, broken]} value='' />);
    await waitFor(() => expect(error).toHaveBeenCalledWith("[CodeEditor] Failed to load language 'broken':", failure));
    expect(view.state.facet(languageFacet)).toBeNull();
  });

  it('supports host props, focus events, autofocus, styles, and an explicit CodeMirror root', () => {
    const onBlur = vi.fn();
    const onFocus = vi.fn();
    const shadowHost = document.createElement('div');
    const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    const result = render(
      <CodeEditor
        aria-label='Code input'
        autoFocus
        className='custom-editor'
        data-testid='editor-host'
        language='plaintext'
        onBlur={onBlur}
        onFocus={onFocus}
        root={shadowRoot}
        style={{ fontSize: '16px' }}
        value=''
      />
    );
    const host = result.getByTestId('editor-host');
    const view = findView(result.container);

    expect(host.className).toContain('h-full w-full overflow-hidden text-xs');
    expect(host.className).toContain('custom-editor');
    expect(host.getAttribute('aria-label')).toBe('Code input');
    expect(host.style.height).toBe('100%');
    expect(host.style.width).toBe('100%');
    expect(host.style.overflow).toBe('hidden');
    expect(host.style.fontSize).toBe('16px');
    expect(view.root).toBe(shadowRoot);
    expect(document.activeElement).toBe(view.contentDOM);
    expect(onFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(view.contentDOM);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  // CER-006 / CEA-008：承担 `role="textbox"` 的是 CodeMirror 动态生成的 `.cm-content`，
  // 不是外层宿主 div。上一条用例里消费者传的 `aria-label` 落在宿主上 —— 那是 host props
  // 透传，保留不动；给内部 textbox 命名必须走专用的 label / labelledBy / describedBy。
  it('writes label, labelledBy, and describedBy onto the element that carries the textbox role', () => {
    const result = render(
      <CodeEditor describedBy='hint-id' label='Code input' labelledBy='label-id' language='plaintext' value='' />
    );
    const view = findView(result.container);

    // 前置：确认这个元素确实是 textbox，否则下面三条断言测的是个无关的 div
    expect(view.contentDOM.getAttribute('role')).toBe('textbox');
    expect(view.contentDOM.getAttribute('aria-label')).toBe('Code input');
    expect(view.contentDOM.getAttribute('aria-labelledby')).toBe('label-id');
    expect(view.contentDOM.getAttribute('aria-describedby')).toBe('hint-id');

    result.rerender(<CodeEditor label='' language='plaintext' value='' />);
    expect(view.contentDOM.hasAttribute('aria-label')).toBe(false);
    expect(view.contentDOM.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('reports disabled to assistive technology instead of only readonly', () => {
    const result = render(<CodeEditor data-testid='editor-host' language='plaintext' value='' />);
    const view = findView(result.container);
    const host = result.getByTestId('editor-host');

    expect(view.contentDOM.hasAttribute('aria-disabled')).toBe(false);
    expect(host.hasAttribute('aria-disabled')).toBe(false);

    result.rerender(<CodeEditor data-testid='editor-host' disabled language='plaintext' value='' />);

    // readonly facet 让 CodeMirror 写出 aria-readonly，但「只读」和「禁用」不是一回事：
    // 屏幕阅读器会把禁用控件读成「可编辑但当前只读」，用户以为解锁后就能输入。
    expect(view.contentDOM.getAttribute('aria-disabled')).toBe('true');
    expect(host.getAttribute('aria-disabled')).toBe('true');
  });

  it.each(['disabled', 'readonly'] as const)('skips autoFocus while %s', propName => {
    const onFocus = vi.fn();
    const result = render(
      <CodeEditor {...{ [propName]: true }} autoFocus language='plaintext' onFocus={onFocus} value='' />
    );
    const view = findView(result.container);

    expect(document.activeElement).not.toBe(view.contentDOM);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('exposes an imperative handle with view, host, focus, and blur via the ref prop', () => {
    const handleRef = createRef<CodeEditorHandle>();
    const result = render(<CodeEditor data-testid='editor-host' language='plaintext' ref={handleRef} value='' />);
    const view = findView(result.container);
    const host = result.getByTestId('editor-host');

    expect(handleRef.current?.view).toBe(view);
    expect(handleRef.current?.host).toBe(host);

    const viewFocus = vi.spyOn(view, 'focus');
    handleRef.current?.focus();
    expect(viewFocus).toHaveBeenCalledTimes(1);

    const contentBlur = vi.spyOn(view.contentDOM, 'blur');
    handleRef.current?.blur();
    expect(contentBlur).toHaveBeenCalledTimes(1);

    result.unmount();
    expect(handleRef.current).toBeNull();
  });

  // CEA-002：语法高亮整体消失（文本可编辑、行号还在，只是全成一个颜色）。
  // 根因不在组件而在依赖解析：`@codemirror/language` 被装了一份自己的嵌套
  // `@codemirror/view`，于是运行时同时存在两份 view。`syntaxHighlighting()` 返回的
  // `treeHighlighter` 是 A 份的 `ViewPlugin`，注册进 A 份的 `viewPlugin` facet；
  // 组件 new 出来的 `EditorView` 是 B 份，只读 B 份的 facet —— 插件永远不被实例化，
  // 装饰集为空，**不报错**。同理波及 `bracketMatching` / `foldGutter` 等所有
  // 出自 `@codemirror/language` 的 ViewPlugin。三端共用同一份 node_modules，
  // 所以三端各留一组：单例（根因）+ 真的染上色（症状）。
  it('resolves a single @codemirror/view copy so language ViewPlugins stay live', () => {
    const plugin = findViewPluginLike(syntaxHighlighting(defaultHighlightStyle));

    // 先确认真的找到了 treeHighlighter，否则下一条断言会因为「没找着」而假绿。
    expect(plugin).not.toBeNull();
    // 跨副本时 `constructor.name` 仍是 ViewPlugin，但 `instanceof` 必然为 false ——
    // 这正是「颜色没了却一声不吭」的判据。
    expect(plugin).toBeInstanceOf(ViewPlugin);
  });

  it('renders highlighted tokens for SQL keywords', async () => {
    const result = render(<CodeEditor language='sql' value='select * from user;' />);

    await waitFor(() => {
      expect(result.container.querySelector('.cm-content span[class]')).not.toBeNull();
    });

    const tokens = [...result.container.querySelectorAll<HTMLElement>('.cm-content span[class]')];
    expect(tokens.map(token => token.textContent)).toContain('select');
  });

  it('renders no highlighted tokens for plaintext', async () => {
    const result = render(<CodeEditor language='plaintext' value='select * from user;' />);
    await flushPromises();

    expect(result.container.querySelectorAll('.cm-content span[class]')).toHaveLength(0);
  });

  // CER-004：语言查不到或 load() rejected 时只有一条 console.error，然后静默退回纯文本。
  // 宿主应用完全观测不到 —— 拿不到错误、没有重试或降级的机会，用户只看到高亮突然消失。
  describe('onLanguageError', () => {
    it('reports a not-found payload synchronously', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const working = LanguageDescription.of({ name: 'Working', load: () => Promise.resolve(createLanguageSupport()) });
      const onLanguageError = vi.fn();
      render(<CodeEditor language='nope' languages={[working]} onLanguageError={onLanguageError} value='' />);

      await waitFor(() => expect(onLanguageError).toHaveBeenCalledTimes(1));
      expect(onLanguageError).toHaveBeenCalledWith({
        kind: 'not-found',
        language: 'nope',
        message: "Language 'nope' not found.",
        cause: undefined
      });
    });

    it('reports a load-failed payload and passes the rejection value through untouched', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failure = new Error('offline');
      const broken = LanguageDescription.of({ name: 'Broken', load: () => Promise.reject(failure) });
      const onLanguageError = vi.fn();
      render(<CodeEditor language='broken' languages={[broken]} onLanguageError={onLanguageError} value='' />);

      await waitFor(() => expect(onLanguageError).toHaveBeenCalledTimes(1));
      const [error] = onLanguageError.mock.calls[0] as [CodeEditorLanguageError];
      expect(error).toMatchObject({
        kind: 'load-failed',
        language: 'broken',
        message: "Failed to load language 'broken'."
      });
      expect(error.cause).toBe(failure);
    });

    it('stays silent for plaintext and for successful loads', async () => {
      const working = LanguageDescription.of({ name: 'Working', load: () => Promise.resolve(createLanguageSupport()) });
      const onLanguageError = vi.fn();
      const result = render(
        <CodeEditor language='working' languages={[working]} onLanguageError={onLanguageError} value='' />
      );
      await flushPromises();

      result.rerender(
        <CodeEditor language='plaintext' languages={[working]} onLanguageError={onLanguageError} value='' />
      );
      await flushPromises();

      expect(onLanguageError).not.toHaveBeenCalled();
    });

    it('drops a stale failure so only the newest request can report', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const slow = createDeferred<LanguageSupport>();
      const slowLanguage = LanguageDescription.of({ name: 'Slow', load: () => slow.promise });
      const fastLanguage = LanguageDescription.of({
        name: 'Fast',
        load: () => Promise.resolve(createLanguageSupport())
      });
      const languages = [slowLanguage, fastLanguage];
      const onLanguageError = vi.fn();
      const result = render(
        <CodeEditor language='slow' languages={languages} onLanguageError={onLanguageError} value='' />
      );

      result.rerender(<CodeEditor language='fast' languages={languages} onLanguageError={onLanguageError} value='' />);
      await act(async () => {
        slow.reject(new Error('stale'));
        await flushPromises();
      });

      expect(onLanguageError).not.toHaveBeenCalled();
    });

    // 与 `onChange` 同构：回调若进 effect 依赖，宿主写内联箭头函数时每次渲染都会
    // 重跑语言 effect —— 换个回调引用就整篇重新词法分析，还会多发一次 load()。
    it('does not re-run the language effect when only the callback identity changes', async () => {
      const load = vi.fn(() => Promise.resolve(createLanguageSupport()));
      const working = LanguageDescription.of({ name: 'Working', load });
      const result = render(
        <CodeEditor language='working' languages={[working]} onLanguageError={() => undefined} value='' />
      );
      await flushPromises();
      expect(load).toHaveBeenCalledTimes(1);

      result.rerender(
        <CodeEditor language='working' languages={[working]} onLanguageError={() => undefined} value='' />
      );
      await flushPromises();

      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  // CER-005：`CodeEditorProps` 的多数成员没有任何 TSDoc，消费者只能靠读源码猜语义。
  // 这条是**静态门禁**：跑源码文本，保证新增 prop 不会又漏掉文档。
  it('documents every public prop with TSDoc', () => {
    const source = readFileSync(join(import.meta.dirname, '../CodeEditor.tsx'), 'utf8');
    const propsBlock = /export interface CodeEditorProps extends CodeEditorHostProps \{\n([\s\S]*?)\n\}\n/.exec(source);
    expect(propsBlock).not.toBeNull();

    // 顶层成员 = 缩进恰好两个空格且以 `name?:` / `name:` 开头的行。
    const lines = propsBlock![1].split('\n');
    const undocumented = lines
      .map((line, index) => ({ index, name: /^ {2}(\w+)\??:/.exec(line)?.[1] }))
      .filter((entry): entry is { index: number; name: string } => entry.name !== undefined)
      .filter(entry => !lines[entry.index - 1]?.trimEnd().endsWith('*/'))
      .map(entry => entry.name);

    expect(undocumented).toEqual([]);
  });
});
