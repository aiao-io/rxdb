/**
 * 用**真实** CodeMirror 验证语言解析与重配置的时机。
 *
 * @remarks
 * CEV-003：`watch([() => props.language, () => props.languages], updateLanguage)`
 * 按数组**引用**触发。父组件在 render 里写 `:languages="[myLang]"` 这类内联字面量时，
 * 每轮更新都会重新查找、`load()` 并 reconfigure 语言 compartment ——
 * 受控大文档等于每次输入重新词法分析。判定基准应当是
 * 「当前语言实际解析到的 description identity」，而不是容器 identity。
 *
 * 同目录 `CodeEditor.spec.ts` 把 `@codemirror/state` / `view` 与 `findLanguageByName`
 * 一起 mock 掉了，「reconfigure 有没有真的发生」在那个文件里表达不出来
 * （CEV-005 点名的盲区之一）；vitest 的 mock 按文件生效，所以另起一个不 mock 的 spec。
 */
import type { CodeEditorLanguageDescription, CodeEditorLanguageSupport } from '@aiao/code-editor';
import { Facet } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { CodeEditor } from '../index';

const languageMarker = Facet.define<string>();

const createDeferredLanguage = (name: string) => {
  const deferred = Promise.withResolvers<CodeEditorLanguageSupport>();
  const load = vi.fn(() => deferred.promise);
  const description = {
    alias: [],
    extensions: [],
    filename: undefined,
    load,
    name,
    support: undefined
  } satisfies CodeEditorLanguageDescription;
  return {
    description,
    load,
    promise: deferred.promise,
    reject: deferred.reject,
    resolve: (marker: string) => deferred.resolve({ extension: languageMarker.of(marker) })
  };
};

/** 等待一次 `load()` 的 then 分支跑完，并让 Vue 把随后的 dispatch 冲刷干净。 */
const settle = async (promise: Promise<unknown>): Promise<void> => {
  await promise.catch(() => undefined);
  await nextTick();
};

type Wrapper = ReturnType<typeof mount>;
const wrappers: Wrapper[] = [];

const mountEditor = (props: Record<string, unknown>): { view: EditorView; wrapper: Wrapper } => {
  const wrapper = mount(CodeEditor, { attachTo: document.body, props });
  wrappers.push(wrapper);

  const host = wrapper.element as HTMLElement;
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') ?? host);
  if (!view) throw new Error('EditorView not found');
  return { view, wrapper };
};

afterEach(() => {
  while (wrappers.length > 0) wrappers.pop()?.unmount();
});

describe('CodeEditor language resolution (real CodeMirror)', () => {
  it('等价的新 languages 数组不重复加载当前语言', async () => {
    const stable = createDeferredLanguage('Stable');
    const { view, wrapper } = mountEditor({ language: 'stable', languages: [stable.description] });
    stable.resolve('stable');
    await settle(stable.promise);

    // 先钉住 arrange：没有这一步，下面的「没多加载」会在「压根没加载过」时也成立。
    expect(stable.load).toHaveBeenCalledTimes(1);
    expect(view.state.facet(languageMarker)).toEqual(['stable']);

    await wrapper.setProps({ languages: [stable.description] });
    await settle(stable.promise);

    expect(stable.load).toHaveBeenCalledTimes(1);
    expect(view.state.facet(languageMarker)).toEqual(['stable']);
  });

  it('languages 换掉未选中的项时也不重复加载当前语言', async () => {
    const stable = createDeferredLanguage('Stable');
    const other = createDeferredLanguage('Other');
    const { wrapper } = mountEditor({
      language: 'stable',
      languages: [stable.description, other.description]
    });
    stable.resolve('stable');
    await settle(stable.promise);
    expect(stable.load).toHaveBeenCalledTimes(1);

    // 只换掉没被选中的那一项：当前语言解析到的还是同一个 description。
    await wrapper.setProps({
      languages: [stable.description, createDeferredLanguage('Other').description]
    });
    await settle(stable.promise);

    expect(stable.load).toHaveBeenCalledTimes(1);
  });

  it('languages 换掉当前选中的项时必须重新加载', async () => {
    const first = createDeferredLanguage('Custom');
    const second = createDeferredLanguage('Custom');
    const { view, wrapper } = mountEditor({ language: 'custom', languages: [first.description] });
    first.resolve('first');
    await settle(first.promise);
    expect(view.state.facet(languageMarker)).toEqual(['first']);

    // 同名但**不同实例**：解析到的 description identity 变了，必须重新加载。
    await wrapper.setProps({ languages: [second.description] });
    second.resolve('second');
    await settle(second.promise);

    expect(second.load).toHaveBeenCalledTimes(1);
    expect(view.state.facet(languageMarker)).toEqual(['second']);
  });

  it('language 改成解析结果相同的别名时不重复加载', async () => {
    const deferred = Promise.withResolvers<CodeEditorLanguageSupport>();
    const load = vi.fn(() => deferred.promise);
    const description = {
      alias: ['ts'],
      extensions: [],
      filename: undefined,
      load,
      name: 'TypeScript',
      support: undefined
    } satisfies CodeEditorLanguageDescription;
    const { wrapper } = mountEditor({ language: 'TypeScript', languages: [description] });
    deferred.resolve({ extension: languageMarker.of('ts') });
    await settle(deferred.promise);
    expect(load).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ language: 'ts' });
    await settle(deferred.promise);

    expect(load).toHaveBeenCalledTimes(1);
  });
});

/**
 * CEV-004：语言查不到与 `load()` rejected 此前都只有一条 `console.error`，
 * 宿主完全观测不到 —— 拿不到错误、没有重试或降级的机会，用户只看到高亮突然消失。
 *
 * 降级策略**不变**（清空语言 Compartment 退回纯文本），`console.error` 也保留；
 * `language-error` 是新增的观测通道，载荷形状由核心包定义，与 Angular 的
 * `aoLanguageError` 输出、React 的 `onLanguageError` 回调逐字一致。
 */
describe('CodeEditor language errors (CEV-004)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('语言查不到时发出 not-found 载荷，并保留日志与纯文本降级', async () => {
    const other = createDeferredLanguage('Other');
    const { view, wrapper } = mountEditor({ language: 'missing', languages: [other.description] });
    await nextTick();

    expect(wrapper.emitted('language-error')).toEqual([
      [{ cause: undefined, kind: 'not-found', language: 'missing', message: "Language 'missing' not found." }]
    ]);
    expect(errorSpy).toHaveBeenCalledWith("[CodeEditor] Language 'missing' not found.");
    expect(view.state.facet(languageMarker)).toEqual([]);
    expect(other.load).not.toHaveBeenCalled();
  });

  it('loader rejected 时发出 load-failed 载荷并原样透传 cause', async () => {
    const broken = createDeferredLanguage('Broken');
    const failure = new Error('chunk load failed');
    const { view, wrapper } = mountEditor({ language: 'broken', languages: [broken.description] });
    broken.reject(failure);
    await settle(broken.promise);

    expect(wrapper.emitted('language-error')).toEqual([
      [{ cause: failure, kind: 'load-failed', language: 'broken', message: "Failed to load language 'broken'." }]
    ]);
    expect(errorSpy).toHaveBeenCalledWith("[CodeEditor] Failed to load language 'broken':", failure);
    expect(view.state.facet(languageMarker)).toEqual([]);
  });

  it('明确不高亮（空串 / plaintext / 空列表）不算错误', async () => {
    const other = createDeferredLanguage('Other');
    const { wrapper } = mountEditor({ language: '', languages: [other.description] });
    await nextTick();
    await wrapper.setProps({ language: 'plaintext' });
    await nextTick();
    await wrapper.setProps({ language: 'anything', languages: [] });
    await nextTick();

    expect(wrapper.emitted('language-error')).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('过期请求的 rejection 既不发事件也不污染当前语言', async () => {
    const stale = createDeferredLanguage('Stale');
    const fresh = createDeferredLanguage('Fresh');
    const { view, wrapper } = mountEditor({ language: 'stale', languages: [stale.description] });

    // 先切走，再让上一次请求失败 —— 竞态守卫必须把它整条丢掉。
    await wrapper.setProps({ language: 'fresh', languages: [fresh.description] });
    fresh.resolve('fresh');
    await settle(fresh.promise);
    stale.reject(new Error('too late'));
    await settle(stale.promise);

    expect(wrapper.emitted('language-error')).toBeUndefined();
    expect(view.state.facet(languageMarker)).toEqual(['fresh']);
  });

  it('卸载后到达的 rejection 不再发事件', async () => {
    const broken = createDeferredLanguage('Broken');
    const { wrapper } = mountEditor({ language: 'broken', languages: [broken.description] });

    wrapper.unmount();
    broken.reject(new Error('after unmount'));
    await settle(broken.promise);

    expect(wrapper.emitted('language-error')).toBeUndefined();
  });
});
