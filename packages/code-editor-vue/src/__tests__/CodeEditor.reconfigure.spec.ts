/**
 * 用**真实** CodeMirror 验证每个 Compartment 的重配置真的落到了 state / DOM 上。
 *
 * @remarks
 * CEV-005 残留：`readonly`/`editable`、Compartment 重配置与异步语言加载此前只有
 * mock 覆盖。mock 出来的 `dispatch` 没有 facet 语义 —— `reconfigure` 调用被记录下来了，
 * 但「记录到调用」和「facet 真的变了」是两回事，96% 覆盖率因此放过了 CEV-001。
 * 本文件把 finding 点名的三块搬进真实回归集：断言的是 `view.state.facet(...)`
 * 与 `contentDOM` 上的真实结果，而不是 mock 的调用记录。
 *
 * 同目录 `CodeEditor.spec.ts` 仍是 mock 的隔离测试，保留不动；
 * vitest 的 mock 按文件生效，所以另起一个不 mock 的 spec。
 */
import type { CodeEditorLanguageDescription, CodeEditorLanguageSupport } from '@aiao/code-editor';
import { deleteCharBackward } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Facet } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import type { CodeEditorExpose } from '../index';
import { CodeEditor } from '../index';

const languageMarker = Facet.define<string>();

type Wrapper = ReturnType<typeof mount>;
const wrappers: Wrapper[] = [];

const mountEditor = (props: Record<string, unknown>): { view: EditorView; wrapper: Wrapper } => {
  const wrapper = mount(CodeEditor, {
    attachTo: document.body,
    props: { language: 'plaintext', ...props }
  });
  wrappers.push(wrapper);

  const host = wrapper.element as HTMLElement;
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') ?? host);
  if (!view) throw new Error('EditorView not found');
  return { view, wrapper };
};

/**
 * `defineExpose` 的类型不进 `mount()` 的返回类型 —— `@vue/test-utils` 的 `vm`
 * 只带 props 与内部实例，直接读 `wrapper.vm.view` 在 `tsconfig.spec.json` 下是 TS2339。
 * 断言成公开契约类型而不是 `any`：`CodeEditorExpose` 少了成员这里就编译不过。
 */
const exposeOf = (wrapper: Wrapper): CodeEditorExpose => wrapper.vm as unknown as CodeEditorExpose;

/** 把 keymap facet 铺平成键名列表 —— 它是 `KeyBinding[]` 的 facet，值本身是二维的。 */
const boundKeys = (view: EditorView): string[] =>
  view.state
    .facet(keymap)
    .flat()
    .map(binding => binding.key ?? '');

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
});

describe('CodeEditor readonly / editable (real facets)', () => {
  it('默认既可编辑也非只读', () => {
    const { view } = mountEditor({});

    expect(view.state.readOnly).toBe(false);
    expect(view.state.facet(EditorView.editable)).toBe(true);
  });

  it('readonly 让 state 只读且不可编辑', async () => {
    const { view, wrapper } = mountEditor({});

    await wrapper.setProps({ readonly: true });

    expect(view.state.readOnly).toBe(true);
    expect(view.state.facet(EditorView.editable)).toBe(false);
  });

  it('disabled 与 readonly 是两条独立来源，任一为真都不可编辑', async () => {
    const { view, wrapper } = mountEditor({});

    await wrapper.setProps({ disabled: true });
    expect(view.state.readOnly).toBe(true);
    expect(view.state.facet(EditorView.editable)).toBe(false);

    // 只放开 disabled，readonly 仍然把它按住。
    await wrapper.setProps({ disabled: false, readonly: true });
    expect(view.state.readOnly).toBe(true);

    await wrapper.setProps({ readonly: false });
    expect(view.state.readOnly).toBe(false);
    expect(view.state.facet(EditorView.editable)).toBe(true);
  });

  it('只读时命令被拒绝、contentDOM 不再可编辑，宿主同步仍然生效', async () => {
    const { view, wrapper } = mountEditor({ value: 'kept' });
    await wrapper.setProps({ readonly: true });

    // CodeMirror 的 `readOnly` 是**命令**去查的，`view.dispatch` 本身从不设防 ——
    // 手写一条 dispatch 来「验证被挡住」测的是 CodeMirror 没有的语义，会假红。
    expect(deleteCharBackward(view)).toBe(false);
    expect(view.state.doc.toString()).toBe('kept');
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');

    // 宿主同步不经过命令层，只读不该挡住它 —— 否则受控用法直接失效。
    await wrapper.setProps({ value: 'pushed' });
    expect(view.state.doc.toString()).toBe('pushed');
  });
});

describe('CodeEditor compartment reconfiguration (real facets)', () => {
  it('theme 切换真的换掉暗色主题而不是只记了一次调用', async () => {
    const { view, wrapper } = mountEditor({ theme: 'light' });
    expect(view.state.facet(EditorView.darkTheme)).toBe(false);

    await wrapper.setProps({ theme: 'dark' });
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);

    await wrapper.setProps({ theme: 'light' });
    expect(view.state.facet(EditorView.darkTheme)).toBe(false);
  });

  it('placeholder 在空文档上渲染出占位元素，清空后移除', async () => {
    const { view, wrapper } = mountEditor({ placeholder: '写点什么', value: '' });
    await nextTick();
    expect(view.contentDOM.querySelector('.cm-placeholder')?.textContent).toBe('写点什么');

    await wrapper.setProps({ placeholder: '' });
    await nextTick();
    expect(view.contentDOM.querySelector('.cm-placeholder')).toBeNull();
  });

  it('lineWrapping 切换真的改写 contentDOM 的类名', async () => {
    const { view, wrapper } = mountEditor({ lineWrapping: false });
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);

    await wrapper.setProps({ lineWrapping: true });
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true);

    await wrapper.setProps({ lineWrapping: false });
    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(false);
  });

  it('indentUnit 写进真实的 indentUnit facet', async () => {
    const { view, wrapper } = mountEditor({});
    expect(view.state.facet(indentUnit)).toBe('  ');

    await wrapper.setProps({ indentUnit: '\t' });
    expect(view.state.facet(indentUnit)).toBe('\t');
  });

  it('indentWithTab 只在开启时把 Tab 绑进 keymap', async () => {
    const { view, wrapper } = mountEditor({});
    expect(boundKeys(view)).not.toContain('Tab');

    await wrapper.setProps({ indentWithTab: true });
    expect(boundKeys(view)).toContain('Tab');

    await wrapper.setProps({ indentWithTab: false });
    expect(boundKeys(view)).not.toContain('Tab');
  });

  it('highlightWhitespace 真的给空格加上装饰', async () => {
    const { view, wrapper } = mountEditor({ value: 'a  b' });
    expect(view.contentDOM.querySelector('.cm-highlightSpace')).toBeNull();

    await wrapper.setProps({ highlightWhitespace: true });
    await vi.waitFor(() => {
      if (!view.contentDOM.querySelector('.cm-highlightSpace')) throw new Error('decoration not ready');
    });

    await wrapper.setProps({ highlightWhitespace: false });
    await nextTick();
    expect(view.contentDOM.querySelector('.cm-highlightSpace')).toBeNull();
  });

  it('setup 切换换掉预设扩展，且不清掉其它 compartment', async () => {
    const { view, wrapper } = mountEditor({ setup: 'basic', theme: 'dark' });
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();

    await wrapper.setProps({ setup: 'minimal' });
    await nextTick();
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
    // setup 的 compartment 独立：换预设不该把主题一起冲掉。
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);

    await wrapper.setProps({ setup: null });
    await nextTick();
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
    expect(view.state.facet(EditorView.darkTheme)).toBe(true);
  });
});

describe('CodeEditor async language loading (real compartment)', () => {
  const createDeferredLanguage = (name: string) => {
    const deferred = Promise.withResolvers<CodeEditorLanguageSupport>();
    const description = {
      alias: [],
      extensions: [],
      filename: undefined,
      load: vi.fn(() => deferred.promise),
      name,
      support: undefined
    } satisfies CodeEditorLanguageDescription;
    return {
      description,
      promise: deferred.promise,
      reject: deferred.reject,
      resolve: (marker: string) => deferred.resolve({ extension: languageMarker.of(marker) })
    };
  };
  const settle = async (promise: Promise<unknown>): Promise<void> => {
    await promise.catch(() => undefined);
    await nextTick();
  };

  it('load() resolve 之前语言 compartment 保持空', async () => {
    const pending = createDeferredLanguage('Pending');
    const { view } = mountEditor({ language: 'pending', languages: [pending.description] });
    await nextTick();

    expect(view.state.facet(languageMarker)).toEqual([]);

    pending.resolve('pending');
    await settle(pending.promise);
    expect(view.state.facet(languageMarker)).toEqual(['pending']);
  });

  it('后发的请求先返回时，迟到的旧结果不得覆盖它', async () => {
    const slow = createDeferredLanguage('Slow');
    const fast = createDeferredLanguage('Fast');
    const { view, wrapper } = mountEditor({ language: 'slow', languages: [slow.description] });

    await wrapper.setProps({ language: 'fast', languages: [fast.description] });
    fast.resolve('fast');
    await settle(fast.promise);
    expect(view.state.facet(languageMarker)).toEqual(['fast']);

    // 旧请求这时才 resolve —— 竞态代号已经过期，它必须被整条丢掉。
    slow.resolve('slow');
    await settle(slow.promise);
    expect(view.state.facet(languageMarker)).toEqual(['fast']);
  });

  it('卸载后到达的 resolve 不再 dispatch 到已销毁的 view', async () => {
    const pending = createDeferredLanguage('Pending');
    const { wrapper } = mountEditor({ language: 'pending', languages: [pending.description] });

    wrapper.unmount();
    pending.resolve('pending');

    // 往已 destroy 的 view 上 dispatch 会抛错，这条断言锁的就是「它没被 dispatch」。
    await expect(settle(pending.promise)).resolves.toBeUndefined();
  });
});

describe('CodeEditor imperative handle (CEA-009 三端对齐)', () => {
  it('暴露 view / host / focus / blur，且 host 是 CodeMirror 挂载所在的元素', async () => {
    const { view, wrapper } = mountEditor({});
    await nextTick();
    const expose = exposeOf(wrapper);

    expect(expose.view).toBe(view);
    expect(expose.host).toBe(wrapper.element);
    expect(expose.host?.contains(view.dom)).toBe(true);

    const blurSpy = vi.spyOn(view.contentDOM, 'blur');
    expose.focus();
    expect(view.hasFocus).toBe(true);

    expose.blur();
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it('卸载后 view 与 host 一起变为 null', async () => {
    const { wrapper } = mountEditor({});
    await nextTick();
    const expose = exposeOf(wrapper);

    wrapper.unmount();

    expect(expose.view).toBeNull();
    expect(expose.host).toBeNull();
  });
});
