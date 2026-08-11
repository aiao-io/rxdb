<script lang="ts" setup>
import type { ResolvedCodeEditorLanguage } from '@aiao/code-editor';
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
import { indentWithTab as indentWithTabCommand } from '@codemirror/commands';
import { indentUnit as indentUnitExt } from '@codemirror/language';
import { Annotation, Compartment, EditorState, type Extension, Transaction } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  highlightWhitespace as highlightWhitespaceExt,
  keymap,
  placeholder as placeholderExt
} from '@codemirror/view';
import { basicSetup, minimalSetup } from 'codemirror';
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

import type { CodeEditorEmits, CodeEditorExpose, CodeEditorProps, CodeEditorSetup } from './code-editor.types.js';

const props = withDefaults(defineProps<CodeEditorProps>(), {
  autoFocus: false,
  describedBy: '',
  disabled: false,
  highlightWhitespace: false,
  indentUnit: '  ',
  indentWithTab: false,
  language: 'sql',
  label: '',
  labelledBy: '',
  languages: () => SUPPORT_LANGUAGES,
  lineWrapping: false,
  placeholder: '',
  readonly: false,
  setup: 'basic',
  theme: 'light',
  value: ''
});

const emit = defineEmits<CodeEditorEmits>();
const editorRef = ref<HTMLDivElement | null>(null);
const viewRef = shallowRef<EditorView | null>(null);
const hostAttributes = computed(() => ({
  'aria-disabled': props.disabled || undefined,
  class: 'aiao-code-editor',
  style: {
    display: 'block',
    fontSize: '0.875rem',
    height: '100%',
    overflow: 'hidden',
    width: '100%'
  }
}));
const setupConf = new Compartment();
const languageConf = new Compartment();
const themeConf = new Compartment();
const readonlyConf = new Compartment();
const editableConf = new Compartment();
const placeholderConf = new Compartment();
const indentWithTabConf = new Compartment();
const indentUnitConf = new Compartment();
const lineWrappingConf = new Compartment();
const highlightWhitespaceConf = new Compartment();
const a11yConf = new Compartment();
const External = Annotation.define<boolean>();
const setupExtensions = {
  basic: basicSetup,
  minimal: minimalSetup
} satisfies Record<Exclude<CodeEditorSetup, null>, Extension>;
let languageRequest = 0;
/** 最近一次**已生效**的语言解析结果，用于跳过等价的重复配置（CEV-003）。 */
let appliedLanguage: ResolvedCodeEditorLanguage | undefined;

onMounted(() => {
  const parent = editorRef.value;
  if (!parent) return;

  const state = EditorState.create({
    doc: props.value,
    extensions: [
      setupConf.of(getSetupExtension()),
      languageConf.of([]),
      themeConf.of([]),
      readonlyConf.of([]),
      editableConf.of([]),
      placeholderConf.of([]),
      indentWithTabConf.of([]),
      indentUnitConf.of([]),
      lineWrappingConf.of([]),
      highlightWhitespaceConf.of([]),
      a11yConf.of([]),
      EditorView.theme({
        '&': { fontSize: '0.875rem', height: '100%' },
        '&.cm-focused': { outline: '2px solid Highlight', outlineOffset: '-2px' },
        '.cm-gutters': { background: 'initial', border: 'none' },
        '.cm-scroller': { overflow: 'auto' }
      }),
      EditorView.domEventObservers({
        blur: () => emit('blur'),
        focus: () => emit('focus')
      }),
      EditorView.updateListener.of(update => {
        const external = update.transactions.some(transaction => transaction.annotation(External));
        if (!update.docChanged || external) return;
        const value = update.state.doc.toString();
        emit('update:value', value);
        emit('change', value);
      })
    ]
  });
  const view = new EditorView({
    parent,
    state,
    ...(props.root ? { root: props.root } : {})
  });

  viewRef.value = view;
  updateTheme();
  updateLanguage();
  updateReadonly();
  updatePlaceholder();
  updateIndent();
  updateLineWrapping();
  updateHighlightWhitespace();
  updateAccessibility();
  // CEA-008 / CER-006（用户可见的行为修正）：`disabled` / `readonly` 都会把编辑器配成
  // 不可编辑，此时仍然抢焦点，用户只会得到一个无法输入、也无从得知为什么无法输入的控件。
  if (props.autoFocus && shouldAutoFocusCodeEditor(props)) view.focus();
});

onUnmounted(() => {
  languageRequest += 1;
  const view = viewRef.value;
  viewRef.value = null;
  view?.destroy();
});

watch(
  () => props.value,
  value => {
    const view = viewRef.value;
    if (!view) return;
    // CEV-001：早先是 `{ from: 0, to: doc.length }` 全文替换 —— CodeMirror 会把落在
    // 替换区内的光标映射到区间起点，宿主保存 / 格式化 / 协同同步一次就把用户送回文档开头。
    // 差量计算走核心包，三端共用同一份实现。
    const changes = computeMinimalDocumentChange(view.state.doc.toString(), value ?? '');
    if (!changes) return;
    view.dispatch({
      // `External` 只被本组件的 update listener 用来阻止回调环路，CodeMirror 的 history
      // **不认识**它；少了 `addToHistory.of(false)`，宿主回写照样进 undo 栈。
      annotations: [External.of(true), Transaction.addToHistory.of(false)],
      changes,
      scrollIntoView: false
    });
  }
);
watch(() => props.setup, updateSetup);
watch(() => props.theme, updateTheme);
watch([() => props.language, () => props.languages], syncLanguage);
watch([() => props.readonly, () => props.disabled], updateReadonly);
watch(() => props.placeholder, updatePlaceholder);
watch([() => props.indentWithTab, () => props.indentUnit], updateIndent);
watch(() => props.lineWrapping, updateLineWrapping);
watch(() => props.highlightWhitespace, updateHighlightWhitespace);
watch([() => props.describedBy, () => props.disabled, () => props.label, () => props.labelledBy], updateAccessibility);

function updateSetup() {
  viewRef.value?.dispatch({
    effects: setupConf.reconfigure(getSetupExtension())
  });
}

function getSetupExtension(): Extension {
  return props.setup === null ? [] : setupExtensions[props.setup];
}

function updateTheme() {
  viewRef.value?.dispatch({
    effects: themeConf.reconfigure(props.theme === 'dark' ? oneDark : [])
  });
}

/**
 * `language` / `languages` 变化后的语言同步。
 *
 * CEV-003：`watch` 按数组**引用**触发。父组件写 `:languages="[myLang]"` 这类内联字面量时，
 * 每轮更新都会重新查找、`load()` 并 reconfigure 语言 compartment ——
 * 受控大文档等于每次输入都整篇重新词法分析。判定基准改成
 * 「当前语言实际解析到的 description identity」，与 Angular / React 同构。
 */
function syncLanguage() {
  const resolved = resolveCodeEditorLanguage(props.language, props.languages);
  if (isSameResolvedLanguage(appliedLanguage, resolved)) return;
  updateLanguage();
}

/**
 * **无条件**重新应用语言配置。挂载时以及 {@link syncLanguage} 判定确有变化时调用。
 */
function updateLanguage() {
  const request = ++languageRequest;
  const view = viewRef.value;
  if (!view) return;

  const language = props.language;
  const resolved = resolveCodeEditorLanguage(language, props.languages);
  appliedLanguage = resolved;
  if (resolved.kind !== 'found') {
    view.dispatch({ effects: languageConf.reconfigure([]) });
    // CEV-004：`none` 是「明确不高亮」，不是错误；只有 `not-found` 才报给宿主。
    if (resolved.kind === 'not-found') {
      console.error(`[CodeEditor] Language '${language}' not found.`);
      emit('language-error', codeEditorLanguageNotFound(language));
    }
    return;
  }

  // 解析结果里已经带着命中的 description —— 早先这里又 `findLanguageByName` 查了一遍，
  // 同一份查找逻辑跑两次，两处结果分叉时没有任何信号。
  void resolved.description.load().then(
    support => {
      if (!isCurrentLanguageRequest(request, view)) return;
      view.dispatch({ effects: languageConf.reconfigure(support.extension as Extension) });
    },
    (error: unknown) => {
      if (!isCurrentLanguageRequest(request, view)) return;
      view.dispatch({ effects: languageConf.reconfigure([]) });
      console.error(`[CodeEditor] Failed to load language '${language}':`, error);
      emit('language-error', codeEditorLanguageLoadFailed(language, error));
    }
  );
}

function isCurrentLanguageRequest(request: number, view: EditorView) {
  return request === languageRequest && viewRef.value === view;
}

function updateReadonly() {
  const view = viewRef.value;
  if (!view) return;
  const readonly = props.readonly || props.disabled;
  view.dispatch({
    effects: [
      readonlyConf.reconfigure(EditorState.readOnly.of(readonly)),
      editableConf.reconfigure(EditorView.editable.of(!readonly))
    ]
  });
}

/**
 * 把无障碍属性写到真正承担 `role="textbox"` 的 `.cm-content` 上。
 *
 * CEA-008 / CER-006：只在宿主 `div` 上补 `aria-*` 是把缺陷换个位置 —— 屏幕阅读器进到
 * textbox 之后读到的仍然是一个没有可访问名称、只报 `aria-readonly` 的多行文本框。
 * `readonlyConf` 让 CodeMirror 写出 `aria-readonly`，但「只读」与「禁用」不是一回事，
 * 禁用语义必须单独告知。属性字典由核心包计算，三端共用同一份实现。
 */
function updateAccessibility() {
  const attributes = buildCodeEditorContentAttributes(props);
  viewRef.value?.dispatch({ effects: a11yConf.reconfigure(EditorView.contentAttributes.of(attributes)) });
}

function updatePlaceholder() {
  viewRef.value?.dispatch({
    effects: placeholderConf.reconfigure(props.placeholder ? placeholderExt(props.placeholder) : [])
  });
}

function updateIndent() {
  viewRef.value?.dispatch({
    effects: [
      indentWithTabConf.reconfigure(props.indentWithTab ? keymap.of([indentWithTabCommand]) : []),
      indentUnitConf.reconfigure(props.indentUnit ? indentUnitExt.of(props.indentUnit) : [])
    ]
  });
}

function updateLineWrapping() {
  viewRef.value?.dispatch({
    effects: lineWrappingConf.reconfigure(props.lineWrapping ? EditorView.lineWrapping : [])
  });
}

function updateHighlightWhitespace() {
  viewRef.value?.dispatch({
    effects: highlightWhitespaceConf.reconfigure(props.highlightWhitespace ? highlightWhitespaceExt() : [])
  });
}

defineExpose<CodeEditorExpose>({
  get view() {
    return viewRef.value;
  },
  // 跟着 `view` 一起置空：`editorRef` 在卸载后仍可能残留元素引用，
  // 而 handle 的契约是「未挂载或已卸载时为 null」，三端逐字一致（CEA-009）。
  get host() {
    return viewRef.value ? editorRef.value : null;
  },
  blur: () => viewRef.value?.contentDOM.blur(),
  focus: () => viewRef.value?.focus()
});
</script>

<template>
  <div
    v-bind="hostAttributes"
    ref="editorRef"
  />
</template>
