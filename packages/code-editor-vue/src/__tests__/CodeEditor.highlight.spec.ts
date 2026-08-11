/**
 * 用**真实** CodeMirror 验证语法高亮真的染上了色。
 *
 * @remarks
 * CEA-002：语法高亮整体消失（文本可编辑、行号还在，只是全成一个颜色）。
 * 根因不在组件而在依赖解析：`@codemirror/language` 被装了一份自己的嵌套
 * `@codemirror/view`，于是运行时同时存在两份 view。`syntaxHighlighting()` 返回的
 * `treeHighlighter` 是 A 份的 `ViewPlugin`，注册进 A 份的 `viewPlugin` facet；
 * 组件 new 出来的 `EditorView` 是 B 份，只读 B 份的 facet —— 插件永远不被实例化，
 * 装饰集为空，**不报错**。同理波及 `bracketMatching` / `foldGutter` 等所有
 * 出自 `@codemirror/language` 的 ViewPlugin。
 *
 * 同目录的 `CodeEditor.spec.ts` 把 `@codemirror/state` / `view` / `commands` 整套
 * mock 掉了，装饰集是死的，这两条**在那个文件里根本表达不出来**；
 * vitest 的 mock 按文件生效，所以必须另起一个不 mock 的 spec。
 */
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { CodeEditor } from '../index';

type Wrapper = ReturnType<typeof mount>;
const wrappers: Wrapper[] = [];

const mountEditor = (language: string, value: string): { view: EditorView; wrapper: Wrapper } => {
  const wrapper = mount(CodeEditor, { attachTo: document.body, props: { language, value } });
  wrappers.push(wrapper);

  const host = wrapper.element as HTMLElement;
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') ?? host);
  if (!view) throw new Error('EditorView not found');
  return { view, wrapper };
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

const queryTokens = (view: EditorView): HTMLElement[] => [
  ...view.dom.querySelectorAll<HTMLElement>('.cm-content span[class]')
];

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
});

describe('CodeEditor syntax highlighting (real CodeMirror)', () => {
  it('resolves a single @codemirror/view copy so language ViewPlugins stay live', () => {
    const plugin = findViewPluginLike(syntaxHighlighting(defaultHighlightStyle));

    // 先确认真的找到了 treeHighlighter，否则下一条断言会因为「没找着」而假绿。
    expect(plugin).not.toBeNull();
    // 跨副本时 `constructor.name` 仍是 ViewPlugin，但 `instanceof` 必然为 false ——
    // 这正是「颜色没了却一声不吭」的判据。
    expect(plugin).toBeInstanceOf(ViewPlugin);
  });

  it('renders highlighted tokens for SQL keywords', async () => {
    const { view } = mountEditor('sql', 'select * from user;');
    await vi.waitFor(() => {
      if (queryTokens(view).length === 0) throw new Error('highlighting not ready');
    });

    expect(queryTokens(view).map(token => token.textContent)).toContain('select');
  });

  it('renders no highlighted tokens for plaintext', async () => {
    const { view } = mountEditor('plaintext', 'select * from user;');
    await nextTick();

    expect(queryTokens(view)).toHaveLength(0);
  });
});
