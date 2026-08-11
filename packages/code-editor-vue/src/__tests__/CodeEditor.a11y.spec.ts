/**
 * 用**真实** CodeMirror 验证无障碍契约落在了正确的元素上。
 *
 * @remarks
 * CEA-008 / CER-006：承担 `role="textbox"` 的是 CodeMirror 动态生成的 `.cm-content`，
 * 不是组件的宿主 `div`。可访问名称与 disabled 语义都必须写到那个元素上 ——
 * 只在宿主上补 `aria-*` 等于把无障碍缺陷换个位置：屏幕阅读器进到 textbox 之后
 * 读到的仍然是一个没有名称、只报 `aria-readonly` 的多行文本框。
 *
 * 同目录的 `CodeEditor.spec.ts` 把 `@codemirror/state` / `@codemirror/view` 整套 mock 掉了，
 * `contentDOM` 上真正落了哪些属性在那个文件里表达不出来（CEV-005 点名的盲区之一）；
 * vitest 的 mock 按文件生效，所以必须另起一个不 mock 的 spec。
 */
import { EditorView } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import { CodeEditor } from '../index';

type Wrapper = ReturnType<typeof mount>;
const wrappers: Wrapper[] = [];

const mountEditor = (props: Record<string, unknown>): { view: EditorView; wrapper: Wrapper } => {
  const wrapper = mount(CodeEditor, {
    attachTo: document.body,
    props: { language: 'plaintext', value: '', ...props }
  });
  wrappers.push(wrapper);

  const host = wrapper.element as HTMLElement;
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') ?? host);
  if (!view) throw new Error('EditorView not found');
  return { view, wrapper };
};

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
});

describe('CodeEditor 无障碍契约', () => {
  it('把 label / labelledBy / describedBy 写到真正承担 textbox role 的元素上', () => {
    const { view } = mountEditor({ describedBy: 'hint-id', label: '代码输入', labelledBy: 'label-id' });

    // 前置：确认这个元素确实是 textbox，否则下面三条断言测的是个无关的 div
    expect(view.contentDOM.getAttribute('role')).toBe('textbox');
    expect(view.contentDOM.getAttribute('aria-label')).toBe('代码输入');
    expect(view.contentDOM.getAttribute('aria-labelledby')).toBe('label-id');
    expect(view.contentDOM.getAttribute('aria-describedby')).toBe('hint-id');
  });

  it('清空 label 时移除属性，而不是留一个空的 aria-label', async () => {
    const { view, wrapper } = mountEditor({ label: '代码输入' });
    expect(view.contentDOM.getAttribute('aria-label')).toBe('代码输入');

    await wrapper.setProps({ label: '' });
    await nextTick();

    expect(view.contentDOM.hasAttribute('aria-label')).toBe(false);
  });

  it('disabled 时把 disabled 语义告诉辅助技术，而不是只报 readonly', async () => {
    const { view, wrapper } = mountEditor({});
    expect(view.contentDOM.hasAttribute('aria-disabled')).toBe(false);

    await wrapper.setProps({ disabled: true });
    await nextTick();

    // readonly facet 让 CodeMirror 写出 aria-readonly，但「只读」和「禁用」不是一回事：
    // 屏幕阅读器会把禁用控件读成「可编辑但当前只读」，用户以为解锁后就能输入。
    expect(view.contentDOM.getAttribute('aria-disabled')).toBe('true');
    expect(wrapper.attributes('aria-disabled')).toBe('true');
  });

  it.each(['disabled', 'readonly'] as const)('%s 时跳过 autoFocus，键盘焦点不落进不可编辑的编辑器', propName => {
    const { view, wrapper } = mountEditor({ [propName]: true, autoFocus: true });

    expect(document.activeElement).not.toBe(view.contentDOM);
    expect(wrapper.emitted('focus')).toBeUndefined();
  });

  it('未禁用时 autoFocus 照常生效', () => {
    // 绿色守卫：上一条不能靠「autoFocus 整个坏掉」来通过。
    const { view } = mountEditor({ autoFocus: true });

    expect(document.activeElement).toBe(view.contentDOM);
  });
});
