import type { CodeEditorLanguageDescription } from '@aiao/code-editor';
import { codeEditorLanguageNotFound } from '@aiao/code-editor';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

interface MockMarker {
  readonly kind: string;
  readonly value?: unknown;
}

interface MockAnnotation {
  readonly type: MockAnnotationType;
  readonly value: boolean;
}

interface MockAnnotationType {
  of(value: boolean): MockAnnotation;
}

interface MockStateConfig {
  readonly doc?: string;
  readonly extensions?: readonly unknown[];
}

interface MockViewConfig {
  readonly parent: HTMLElement;
  readonly root?: Document | ShadowRoot;
  readonly state: MockEditorState;
}

interface MockChangeSpec {
  readonly from: number;
  readonly insert: string;
  readonly to: number;
}

interface MockDispatchSpec {
  readonly annotations?: unknown;
  readonly changes?: MockChangeSpec;
  readonly effects?: unknown;
}

interface MockTransaction {
  annotation(type: unknown): unknown;
}

interface MockViewUpdate {
  readonly docChanged: boolean;
  readonly state: MockEditorState;
  readonly transactions: readonly MockTransaction[];
}

type MockUpdateListener = (update: MockViewUpdate) => void;
interface MockEditorViewLike {
  readonly contentDOM: HTMLDivElement;
}

type MockDomObserver = (event: Event, view: MockEditorViewLike) => void;

interface MockDomObservers {
  readonly blur?: MockDomObserver;
  readonly focus?: MockDomObserver;
}

class MockDocument {
  private value: string;

  get length() {
    return this.value.length;
  }

  constructor(value: string) {
    this.value = value;
  }

  replace({ from, insert, to }: MockChangeSpec) {
    this.value = `${this.value.slice(0, from)}${insert}${this.value.slice(to)}`;
  }

  toString() {
    return this.value;
  }
}

class MockEditorState {
  readonly doc: MockDocument;
  readonly extensions: readonly unknown[];

  constructor({ doc = '', extensions = [] }: MockStateConfig) {
    this.doc = new MockDocument(doc);
    this.extensions = extensions;
  }
}

const mockCodeMirror = vi.hoisted(() => {
  const marker = (kind: string, value?: unknown): MockMarker => ({ kind, value });
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

  const findMarker = (extensions: readonly unknown[], kind: string): MockMarker | undefined => {
    const pending = [...extensions];
    while (pending.length > 0) {
      const extension = pending.shift();
      if (Array.isArray(extension)) {
        pending.push(...extension);
        continue;
      }
      if (!isRecord(extension)) continue;
      if (extension['kind'] === kind) return extension as unknown as MockMarker;
      if (extension['value'] !== undefined) pending.push(extension['value']);
    }
    return undefined;
  };

  const annotationType: MockAnnotationType = {
    of: vi.fn((value: boolean): MockAnnotation => ({ type: annotationType, value }))
  };

  const createAnnotationType = vi.fn(() => annotationType);
  const editorViews: MockEditorView[] = [];
  let compartmentId = 0;

  class MockCompartment {
    readonly id = ++compartmentId;

    of(value: unknown) {
      return { kind: 'compartment.of', compartment: this, value };
    }

    reconfigure(value: unknown) {
      return { kind: 'compartment.reconfigure', compartment: this, value };
    }
  }

  class MockEditorView {
    #domObservers: MockDomObservers | undefined;
    #updateListener: MockUpdateListener | undefined;

    // 真实断言在 `CodeEditor.a11y.spec.ts`（不 mock CodeMirror）里 —— 这里只需要让
    // 组件挂载时对这个 facet 的调用不炸掉。
    static readonly contentAttributes = {
      of: vi.fn((value: Record<string, string>) => marker('contentAttributes', value))
    };
    static readonly domEventObservers = vi.fn((observers: MockDomObservers) => marker('domEventObservers', observers));
    static readonly editable = { of: vi.fn((value: boolean) => marker('editable', value)) };
    static readonly lineWrapping = marker('lineWrapping');
    static readonly theme = vi.fn((value: unknown) => marker('theme', value));
    static readonly updateListener = {
      of: vi.fn((listener: MockUpdateListener) => marker('updateListener', listener))
    };

    readonly contentDOM: HTMLDivElement;
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
      this.dom.remove();
    });
    readonly dispatch = vi.fn((spec: MockDispatchSpec) => this.applyDispatch(spec));
    readonly dom: HTMLDivElement;
    readonly focus = vi.fn(() => this.contentDOM.dispatchEvent(new FocusEvent('focus')));
    readonly parent: HTMLElement;
    readonly root: Document | ShadowRoot | undefined;
    readonly state: MockEditorState;
    destroyed = false;

    constructor(config: MockViewConfig) {
      this.state = config.state;
      this.parent = config.parent;
      this.root = config.root;
      this.dom = document.createElement('div');
      this.dom.className = 'cm-editor';
      this.contentDOM = document.createElement('div');
      this.contentDOM.className = 'cm-content';
      this.dom.append(this.contentDOM);
      this.parent.append(this.dom);
      this.#updateListener = findMarker(this.state.extensions, 'updateListener')?.value as
        MockUpdateListener | undefined;
      this.#domObservers = findMarker(this.state.extensions, 'domEventObservers')?.value as
        MockDomObservers | undefined;
      this.contentDOM.addEventListener('focus', event => this.#domObservers?.focus?.(event, this));
      this.contentDOM.addEventListener('blur', event => this.#domObservers?.blur?.(event, this));
      editorViews.push(this);
    }

    private applyDispatch(spec: MockDispatchSpec) {
      if (spec.changes) this.state.doc.replace(spec.changes);
      const annotations = Array.isArray(spec.annotations) ? spec.annotations : [spec.annotations];
      const transaction: MockTransaction = {
        annotation: type =>
          annotations.find(annotation => isRecord(annotation) && annotation['type'] === type)?.['value']
      };
      this.#updateListener?.({
        docChanged: Boolean(spec.changes),
        state: this.state,
        transactions: [transaction]
      });
    }
  }

  const createEditorState = vi.fn((config: MockStateConfig) => new MockEditorState(config));
  const readOnlyOf = vi.fn((value: boolean) => marker('readOnly', value));
  const editableOf = MockEditorView.editable.of;
  const placeholder = vi.fn((value: string) => marker('placeholder', value));
  const keymapOf = vi.fn((value: readonly unknown[]) => marker('keymap', value));
  const indentUnitOf = vi.fn((value: string) => marker('indentUnit', value));
  const highlightWhitespace = vi.fn(() => marker('highlightWhitespace'));
  const basicSetup = marker('basicSetup');
  const minimalSetup = marker('minimalSetup');
  const oneDark = marker('oneDark');
  const indentWithTab = marker('indentWithTab');

  return {
    MockCompartment,
    MockEditorView,
    annotationType,
    basicSetup,
    createAnnotationType,
    createEditorState,
    editableOf,
    editorViews,
    highlightWhitespace,
    indentUnitOf,
    indentWithTab,
    keymapOf,
    marker,
    minimalSetup,
    oneDark,
    placeholder,
    readOnlyOf
  };
});

const mockLanguages = vi.hoisted(() => {
  const createLanguage = (name: string, alias: readonly string[] = []) => ({
    alias,
    extensions: [] as readonly string[],
    filename: undefined,
    load: vi.fn(async () => ({ extension: { extension: [] as const, kind: `${name}.extension` } })),
    name,
    support: undefined
  });
  const sql = createLanguage('SQL');
  const typeScript = createLanguage('TypeScript', ['ts']);
  const json = createLanguage('JSON');
  const supportLanguages = [sql, typeScript, json] as const;
  return { createLanguage, json, sql, supportLanguages, typeScript };
});

// 部分 mock：只替换组件直接构造的那几个符号。整体 mock 会把 `Transaction` 一起吞掉，
// 而外部同步需要 `Transaction.addToHistory.of(false)`（CEV-001）——
// 缺了它组件在 watcher 里静默抛错，而这个 mock 套件只会报一句无关的 Vue warn。
vi.mock('@codemirror/state', async importOriginal => ({
  ...(await importOriginal<typeof import('@codemirror/state')>()),
  Annotation: { define: mockCodeMirror.createAnnotationType },
  Compartment: mockCodeMirror.MockCompartment,
  EditorState: {
    create: mockCodeMirror.createEditorState,
    readOnly: { of: mockCodeMirror.readOnlyOf }
  }
}));

vi.mock('@codemirror/view', () => ({
  EditorView: mockCodeMirror.MockEditorView,
  highlightWhitespace: mockCodeMirror.highlightWhitespace,
  keymap: { of: mockCodeMirror.keymapOf },
  placeholder: mockCodeMirror.placeholder
}));

// 部分 mock：只替换 `indentUnit`。整体 mock 会连 `LanguageDescription` 一起吞掉，
// 而 `@aiao/code-editor` 需要它——组件一旦从核心包 import 任何真实符号就会加载失败。
vi.mock('@codemirror/language', async importOriginal => ({
  ...(await importOriginal<typeof import('@codemirror/language')>()),
  indentUnit: { of: mockCodeMirror.indentUnitOf }
}));

vi.mock('@codemirror/commands', () => ({
  indentWithTab: mockCodeMirror.indentWithTab
}));

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: mockCodeMirror.oneDark
}));

vi.mock('codemirror', () => ({
  basicSetup: mockCodeMirror.basicSetup,
  minimalSetup: mockCodeMirror.minimalSetup
}));

// `computeMinimalDocumentChange` / `resolveCodeEditorLanguage` 都是纯函数，没有 mock 的理由 ——
// 用 importOriginal 透传真实实现，避免这里再写一份差量或查找算法（那正是三端分叉的来源）。
// 只替换默认语言列表：组件对语言的全部依赖都经由 `resolveCodeEditorLanguage`，
// 而它拿到的候选列表来自 props，mock 掉默认值就够了。
vi.mock('@aiao/code-editor', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/code-editor')>();
  return {
    ...actual,
    SUPPORT_LANGUAGES: mockLanguages.supportLanguages
  };
});

import type { CodeEditorEmits, CodeEditorExpose, CodeEditorProps } from '../index';
import { CodeEditor } from '../index';

const createWrapper = (props: CodeEditorProps = {}) =>
  mount(CodeEditor, {
    attachTo: document.body,
    props
  });

type CodeEditorWrapper = ReturnType<typeof createWrapper>;

const wrappers: CodeEditorWrapper[] = [];

const mountEditor = (props: CodeEditorProps = {}) => {
  const wrapper = createWrapper(props);
  wrappers.push(wrapper);
  return wrapper;
};

const getView = (index = 0) => {
  const view = mockCodeMirror.editorViews[index];
  if (!view) throw new Error(`EditorView ${index} was not created`);
  return view;
};

/**
 * `defineExpose` 的类型不进 `mount()` 的返回类型 —— `@vue/test-utils` 的 `vm`
 * 只带 props 与内部实例，直接读 `wrapper.vm.view` 在 `tsconfig.spec.json` 下是 TS2339。
 * 断言成公开契约类型而不是 `any`：`CodeEditorExpose` 少了成员这里就编译不过。
 */
const exposeOf = (wrapper: CodeEditorWrapper): CodeEditorExpose => wrapper.vm as unknown as CodeEditorExpose;

type MockEditorViewInstance = InstanceType<typeof mockCodeMirror.MockEditorView>;
type MockLanguageSupport = Awaited<ReturnType<typeof mockLanguages.typeScript.load>>;

const getReconfiguredValues = (view: MockEditorViewInstance) =>
  view.dispatch.mock.calls.flatMap(([spec]) => {
    const effects = Array.isArray(spec.effects) ? spec.effects : [spec.effects];
    return effects.flatMap(effect => {
      if (typeof effect !== 'object' || effect === null) return [];
      if (!('kind' in effect) || effect.kind !== 'compartment.reconfigure') return [];
      return [effect.value];
    });
  });

const createDeferred = <T>() => {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCodeMirror.editorViews.length = 0;
  mockLanguages.sql.load.mockResolvedValue({ extension: { extension: [], kind: 'SQL.extension' } });
  mockLanguages.typeScript.load.mockResolvedValue({
    extension: { extension: [], kind: 'TypeScript.extension' }
  });
  mockLanguages.json.load.mockResolvedValue({ extension: { extension: [], kind: 'JSON.extension' } });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exists()) wrapper.unmount();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('CodeEditor Vue', () => {
  it('真实挂载时创建 EditorState 和 EditorView，并使用基础 setup', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wrapper = mountEditor({ value: 'const answer = 42;' });
    await flushPromises();

    expect(warn).not.toHaveBeenCalled();
    expect(mockCodeMirror.createEditorState).toHaveBeenCalledTimes(1);
    expect(mockCodeMirror.createEditorState).toHaveBeenCalledWith(
      expect.objectContaining({ doc: 'const answer = 42;' })
    );
    expect(mockCodeMirror.editorViews).toHaveLength(1);
    expect(getView().parent).toBe(wrapper.element);
    expect(getView().state.doc.toString()).toBe('const answer = 42;');
    expect(getView().state.extensions).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: mockCodeMirror.basicSetup })])
    );
    expect(wrapper.classes()).toContain('aiao-code-editor');
  });

  it('布局关键样式通过 EditorView.theme 内联注入，不依赖发布产物的 <style scoped> CSS', async () => {
    mountEditor({ value: 'const answer = 42;' });
    await flushPromises();

    expect(mockCodeMirror.MockEditorView.theme).toHaveBeenCalledWith(
      expect.objectContaining({
        '&': expect.objectContaining({ height: '100%' }),
        '.cm-scroller': expect.objectContaining({ overflow: 'auto' })
      })
    );
    expect(getView().state.extensions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'theme' })]));
  });

  it('初始化时传递 root、minimal setup，并执行 autoFocus', async () => {
    const rootHost = document.createElement('div');
    const root = rootHost.attachShadow({ mode: 'open' });
    mountEditor({ autoFocus: true, root, setup: 'minimal' });
    await flushPromises();

    expect(getView().root).toBe(root);
    expect(getView().state.extensions).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: mockCodeMirror.minimalSetup })])
    );
    expect(getView().focus).toHaveBeenCalledTimes(1);
  });

  it('indentUnit 默认两个空格，与 Angular / React 一致', async () => {
    mountEditor({ language: 'plaintext' });
    await flushPromises();

    // 三端声明默认值统一为 '  '（Angular `code-editor.ts:110`、React `CodeEditor.tsx:83`）。
    // 锁的是可观测契约：不传 indentUnit 时缩进单位就是两个空格。
    expect(mockCodeMirror.indentUnitOf).toHaveBeenLastCalledWith('  ');
  });

  it('setup 为 null 时不加载预置扩展', async () => {
    mountEditor({ language: 'plaintext', setup: null });
    await flushPromises();

    expect(getView().state.extensions[0]).toEqual(expect.objectContaining({ value: [] }));
  });

  it('用户编辑触发 update:value 和 change，非文档事务不触发', async () => {
    const wrapper = mountEditor({ language: 'plaintext', value: 'before' });
    const view = getView();

    view.dispatch({ changes: { from: 0, insert: 'after', to: view.state.doc.length } });
    view.dispatch({ effects: { kind: 'selection-only' } });
    await nextTick();

    expect(wrapper.emitted('update:value')).toEqual([['after']]);
    expect(wrapper.emitted('change')).toEqual([['after']]);
  });

  it('外部 value 同步更新文档但不反向 emit，相同值不 dispatch', async () => {
    const wrapper = mountEditor({ language: 'plaintext', value: 'before' });
    const view = getView();
    view.dispatch.mockClear();

    await wrapper.setProps({ value: 'after' });

    expect(view.state.doc.toString()).toBe('after');
    expect(mockCodeMirror.annotationType.of).toHaveBeenCalledWith(true);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();

    view.dispatch.mockClear();
    await wrapper.setProps({ value: 'after' });
    expect(view.dispatch).not.toHaveBeenCalled();
  });

  it('动态 reconfigure setup、主题、访问状态和编辑体验配置', async () => {
    const wrapper = mountEditor({ language: 'plaintext' });
    const view = getView();
    view.dispatch.mockClear();

    await wrapper.setProps({
      disabled: true,
      highlightWhitespace: true,
      indentUnit: '\t',
      indentWithTab: true,
      lineWrapping: true,
      placeholder: 'Write code',
      readonly: true,
      setup: 'minimal',
      theme: 'dark'
    });

    expect(mockCodeMirror.readOnlyOf).toHaveBeenLastCalledWith(true);
    expect(mockCodeMirror.editableOf).toHaveBeenLastCalledWith(false);
    expect(mockCodeMirror.placeholder).toHaveBeenLastCalledWith('Write code');
    expect(mockCodeMirror.keymapOf).toHaveBeenLastCalledWith([mockCodeMirror.indentWithTab]);
    expect(mockCodeMirror.indentUnitOf).toHaveBeenLastCalledWith('\t');
    expect(mockCodeMirror.highlightWhitespace).toHaveBeenCalled();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(getReconfiguredValues(view)).toEqual(
      expect.arrayContaining([
        mockCodeMirror.minimalSetup,
        mockCodeMirror.oneDark,
        mockCodeMirror.MockEditorView.lineWrapping
      ])
    );

    await wrapper.setProps({
      disabled: false,
      highlightWhitespace: false,
      indentUnit: '',
      indentWithTab: false,
      lineWrapping: false,
      placeholder: '',
      readonly: false,
      setup: 'basic',
      theme: 'light'
    });

    expect(mockCodeMirror.readOnlyOf).toHaveBeenLastCalledWith(false);
    expect(mockCodeMirror.editableOf).toHaveBeenLastCalledWith(true);
    expect(wrapper.attributes('aria-disabled')).toBeUndefined();
    expect(getReconfiguredValues(view)).toEqual(expect.arrayContaining([mockCodeMirror.basicSetup, []]));
  });

  it('支持自定义 languages，并在列表变化时重新加载当前语言', async () => {
    const first = mockLanguages.createLanguage('Custom', ['custom-alias']);
    const second = mockLanguages.createLanguage('Custom', ['custom-alias']);
    const wrapper = mountEditor({ language: 'custom-alias', languages: [first] });
    await flushPromises();

    // CEV-004 之前这里还断言过组件自己调了一次 `findLanguageByName` —— 那是
    // `resolveCodeEditorLanguage` 之后的**重复查找**，已经删掉。查找命中与否
    // 可观测的部分就是「哪个 description 的 load 被调用了」，断言改钉这个。
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(getReconfiguredValues(getView())).toContainEqual(expect.objectContaining({ kind: 'Custom.extension' }));

    await wrapper.setProps({ languages: [second] });
    await flushPromises();

    expect(second.load).toHaveBeenCalledTimes(1);
  });

  it('空 languages 列表同步清空语言且不发起加载', async () => {
    mountEditor({ language: 'sql', languages: [] });
    await flushPromises();

    expect(mockLanguages.sql.load).not.toHaveBeenCalled();
    expect(getReconfiguredValues(getView())).toContainEqual([]);
  });

  it.each(['', 'plaintext'])('语言为 %j 时同步清空语言扩展', async language => {
    mountEditor({ language });
    await flushPromises();

    expect(mockLanguages.sql.load).not.toHaveBeenCalled();
    expect(getReconfiguredValues(getView())).toContainEqual([]);
  });

  it('未知语言报告错误并清空语言扩展', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mountEditor({ language: 'not-real' });
    await flushPromises();

    expect(error).toHaveBeenCalledWith("[CodeEditor] Language 'not-real' not found.");
    expect(getReconfiguredValues(getView())).toContainEqual([]);
  });

  it('语言加载失败时报告错误并清空语言扩展', async () => {
    const failure = new Error('load failed');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLanguages.sql.load.mockRejectedValue(failure);
    mountEditor({ language: 'sql' });
    await flushPromises();

    expect(error).toHaveBeenCalledWith("[CodeEditor] Failed to load language 'sql':", failure);
    expect(getReconfiguredValues(getView())).toContainEqual([]);
  });

  it('快速切换语言时只有最后一次异步结果生效', async () => {
    const typeScriptLoad = createDeferred<MockLanguageSupport>();
    const jsonLoad = createDeferred<MockLanguageSupport>();
    mockLanguages.typeScript.load.mockReturnValue(typeScriptLoad.promise);
    mockLanguages.json.load.mockReturnValue(jsonLoad.promise);
    const wrapper = mountEditor({ language: 'plaintext' });
    const view = getView();
    view.dispatch.mockClear();

    await wrapper.setProps({ language: 'typescript' });
    await wrapper.setProps({ language: 'json' });
    jsonLoad.resolve({ extension: { extension: [], kind: 'JSON.latest' } });
    await flushPromises();
    typeScriptLoad.resolve({ extension: { extension: [], kind: 'TypeScript.stale' } });
    await flushPromises();

    expect(getReconfiguredValues(view)).toContainEqual(expect.objectContaining({ kind: 'JSON.latest' }));
    expect(getReconfiguredValues(view)).not.toContainEqual(expect.objectContaining({ kind: 'TypeScript.stale' }));
  });

  it('旧语言请求失败时不清空已生效的新语言', async () => {
    const typeScriptLoad = createDeferred<MockLanguageSupport>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLanguages.typeScript.load.mockReturnValue(typeScriptLoad.promise);
    const wrapper = mountEditor({ language: 'plaintext' });
    const view = getView();
    view.dispatch.mockClear();

    await wrapper.setProps({ language: 'typescript' });
    await wrapper.setProps({ language: 'json' });
    await flushPromises();
    typeScriptLoad.reject(new Error('stale failure'));
    await flushPromises();

    expect(error).not.toHaveBeenCalled();
    expect(getReconfiguredValues(view)).toContainEqual(expect.objectContaining({ kind: 'JSON.extension' }));
    expect(getReconfiguredValues(view)).not.toContainEqual([]);
  });

  it('卸载销毁 EditorView，pending 语言加载完成后不再 dispatch', async () => {
    const load = createDeferred<MockLanguageSupport>();
    mockLanguages.sql.load.mockReturnValue(load.promise);
    const wrapper = mountEditor({ language: 'sql' });
    const view = getView();

    wrapper.unmount();
    const dispatchCount = view.dispatch.mock.calls.length;
    load.resolve({ extension: { extension: [], kind: 'SQL.after-unmount' } });
    await flushPromises();

    expect(view.destroy).toHaveBeenCalledTimes(1);
    expect(view.dispatch).toHaveBeenCalledTimes(dispatchCount);
  });

  it('透传 focus 和 blur 事件', async () => {
    const wrapper = mountEditor({ language: 'plaintext' });
    const view = getView();

    view.contentDOM.dispatchEvent(new FocusEvent('focus'));
    view.contentDOM.dispatchEvent(new FocusEvent('blur'));
    await nextTick();

    expect(wrapper.emitted('focus')).toEqual([[]]);
    expect(wrapper.emitted('blur')).toEqual([[]]);
  });

  it('defineExpose 暴露 view/host/focus/blur，命令式 API 与 React/Angular 对齐', async () => {
    const wrapper = mountEditor({ language: 'plaintext' });
    await flushPromises();
    const expose = exposeOf(wrapper);
    const view = getView();
    const blurSpy = vi.spyOn(view.contentDOM, 'blur');

    expect(expose.view).toBe(view);
    expect(expose.host).toBe(wrapper.element);

    expose.focus();
    expect(view.focus).toHaveBeenCalledTimes(1);

    expose.blur();
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it('卸载后 defineExpose 的 view 与 host 一起变为 null', async () => {
    const wrapper = mountEditor({ language: 'plaintext' });
    await flushPromises();
    const expose = exposeOf(wrapper);

    wrapper.unmount();

    expect(expose.view).toBeNull();
    expect(expose.host).toBeNull();
  });

  it('公开 Props 和 Emits 类型覆盖完整 API', () => {
    const props = {
      autoFocus: true,
      describedBy: 'hint-id',
      disabled: false,
      highlightWhitespace: true,
      indentUnit: '  ',
      indentWithTab: true,
      language: 'typescript',
      label: '代码输入',
      labelledBy: 'label-id',
      languages: mockLanguages.supportLanguages,
      lineWrapping: true,
      placeholder: 'Code',
      readonly: false,
      root: document,
      setup: 'basic',
      theme: 'dark',
      value: 'const value = 1;'
    } satisfies Required<CodeEditorProps>;
    const emits = {
      blur: [] as const,
      change: ['next'] as const,
      focus: [] as const,
      'language-error': [codeEditorLanguageNotFound('missing')] as const,
      'update:value': ['next'] as const
    } satisfies CodeEditorEmits;

    expect(props.languages).toBe(mockLanguages.supportLanguages);
    expect(emits['update:value']).toEqual(['next']);
  });

  it('README 和 package.json 不再要求消费者手动引入 CSS（布局关键样式已内联注入）', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const readme = await readFile(resolve(process.cwd(), 'README.md'), 'utf8');
    const packageJson = await readFile(resolve(process.cwd(), 'package.json'), 'utf8');

    expect(readme).toContain('v-model:value="code"');
    expect(readme).not.toContain('style.css');
    expect(packageJson).not.toContain('style.css');
  });

  it('自定义语言对象符合核心公开类型', () => {
    const language = mockLanguages.createLanguage('Typed') satisfies CodeEditorLanguageDescription;
    expect(language.name).toBe('Typed');
  });
});
