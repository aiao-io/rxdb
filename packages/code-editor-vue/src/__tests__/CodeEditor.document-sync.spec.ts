/**
 * 用**真实** CodeMirror 验证宿主回写 `value` 的选区与 undo 语义。
 *
 * @remarks
 * CEV-001：同目录的 `CodeEditor.spec.ts` 把 `@codemirror/state` / `view` / `commands`
 * 整套 mock 掉了，因此「光标是否被送回开头」「事务是否进了 undo 栈」这两条
 * **在那个文件里根本表达不出来**。vitest 的 mock 是按文件生效的，
 * 所以这些断言必须放在一个不 mock 的独立 spec 里。
 */
import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { CodeEditor } from '../index';

type Wrapper = ReturnType<typeof mount>;
const wrappers: Wrapper[] = [];

const mountEditor = (value: string): { wrapper: Wrapper; view: EditorView } => {
  const wrapper = mount(CodeEditor, { attachTo: document.body, props: { language: 'plaintext', value } });
  wrappers.push(wrapper);

  const host = wrapper.element as HTMLElement;
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') ?? host);
  if (!view) throw new Error('EditorView not found');
  return { wrapper, view };
};

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
});

describe('CodeEditor external value sync (real CodeMirror)', () => {
  // 全文替换（`from: 0, to: doc.length`）会把落在替换区内的光标映射到区间起点，
  // 用户保存 / 格式化 / 协同同步一次就被送回文档开头。
  it('keeps the caret position when an external value append arrives', async () => {
    const { wrapper, view } = mountEditor('hello world');
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.state.selection.main.head).toBe(2);

    await wrapper.setProps({ value: 'hello worlds' });
    await nextTick();

    expect(view.state.doc.toString()).toBe('hello worlds');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('keeps a range selection intact across an external sync', async () => {
    const { wrapper, view } = mountEditor('abcdefgh');
    view.dispatch({ selection: { anchor: 2, head: 5 } });

    await wrapper.setProps({ value: 'abcdefgh-tail' });
    await nextTick();

    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(5);
  });

  // `External` annotation 只被组件自己的 update listener 用来阻止回调环路，
  // CodeMirror 的 history 不认识它 —— 少了 `Transaction.addToHistory.of(false)`，
  // 宿主回写照样进 undo 栈。
  it('keeps host-driven value sync out of the undo history', async () => {
    const { wrapper, view } = mountEditor('hello world');
    expect(undoDepth(view.state)).toBe(0);

    await wrapper.setProps({ value: 'hello brave world' });
    await nextTick();

    expect(view.state.doc.toString()).toBe('hello brave world');
    expect(undoDepth(view.state)).toBe(0);
  });

  it('still records the user own edits in the undo history', () => {
    const { view } = mountEditor('start');
    view.dispatch({ changes: { from: 5, insert: '!' } });

    expect(undoDepth(view.state)).toBe(1);
  });

  it('rewrites only the changed span, leaving the common prefix and suffix untouched', async () => {
    const { wrapper, view } = mountEditor('hello world');
    const touched: Array<{ from: number; to: number; insert: string }> = [];
    view.dispatch({ selection: { anchor: 0 } });

    const original = view.dispatch.bind(view);
    view.dispatch = ((...specs: Parameters<EditorView['dispatch']>) => {
      for (const spec of specs) {
        const changes = (spec as { changes?: { from: number; to?: number; insert?: string } }).changes;
        if (changes) touched.push({ from: changes.from, to: changes.to ?? changes.from, insert: changes.insert ?? '' });
      }
      return original(...specs);
    }) as EditorView['dispatch'];

    await wrapper.setProps({ value: 'hello brave world' });
    await nextTick();

    expect(touched).toEqual([{ from: 6, to: 6, insert: 'brave ' }]);
  });
});
