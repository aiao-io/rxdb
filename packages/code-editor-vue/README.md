# @aiao/code-editor-vue

基于 CodeMirror 6 的 Vue 3 代码编辑器组件。

## 安装

```bash
pnpm add @aiao/code-editor-vue
```

## 使用

```vue
<script lang="ts" setup>
import { ref } from 'vue';
import { CodeEditor } from '@aiao/code-editor-vue';

const code = ref('const answer = 42;');
</script>

<template>
  <CodeEditor
    v-model:value="code"
    @blur="console.log('blur')"
    @focus="console.log('focus')"
    language="typescript"
    theme="dark"
  />
</template>
```

`v-model:value` 同步 `value` / `update:value`。`change` 只在用户修改文档时触发，外部 `value` 更新不会反向触发。

## Props

| Prop                  | 类型                                       | 默认值              | 行为                 |
| --------------------- | ------------------------------------------ | ------------------- | -------------------- |
| `value`               | `string`                                   | `''`                | 动态同步             |
| `theme`               | `'light' \| 'dark'`                        | `'light'`           | 动态重配置           |
| `language`            | `string`                                   | `'sql'`             | 动态异步加载         |
| `languages`           | `readonly CodeEditorLanguageDescription[]` | `SUPPORT_LANGUAGES` | 动态替换语言列表     |
| `placeholder`         | `string`                                   | `''`                | 动态重配置           |
| `readonly`            | `boolean`                                  | `false`             | 动态重配置           |
| `disabled`            | `boolean`                                  | `false`             | 动态重配置           |
| `setup`               | `'basic' \| 'minimal'`                     | `'basic'`           | 动态重配置           |
| `indentWithTab`       | `boolean`                                  | `false`             | 动态重配置           |
| `indentUnit`          | `string`                                   | `'  '`              | 动态重配置           |
| `lineWrapping`        | `boolean`                                  | `false`             | 动态重配置           |
| `highlightWhitespace` | `boolean`                                  | `false`             | 动态重配置           |
| `autoFocus`           | `boolean`                                  | `false`             | 仅初始化时读取       |
| `root`                | `Document \| ShadowRoot`                   | `undefined`         | 仅初始化时传给编辑器 |

空字符串或 `plaintext` 会清空语言扩展。未知语言和加载失败会**降级为纯文本**并发出 `language-error`
（见下），编辑器本身继续可用。快速切换语言时，只有最后一次请求可以更新当前编辑器。

自定义语言列表使用核心包的公开类型：

```ts
import type { CodeEditorLanguageDescription } from '@aiao/code-editor';

declare const myLanguage: CodeEditorLanguageDescription;
const languages: readonly CodeEditorLanguageDescription[] = [myLanguage];
```

```vue
<CodeEditor v-model:value="code" :languages="languages" language="my-language" />
```

## Events

| 事件             | 参数                               | 触发时机                                                   |
| ---------------- | ---------------------------------- | ---------------------------------------------------------- |
| `update:value`   | `(value: string)`                  | 用户修改文档                                               |
| `change`         | `(value: string)`                  | 用户修改文档                                               |
| `focus`          | `()`                               | 编辑器内容区域获得焦点                                     |
| `blur`           | `()`                               | 编辑器内容区域失去焦点                                     |
| `language-error` | `(error: CodeEditorLanguageError)` | 语言查不到（`not-found`）或 `load()` 失败（`load-failed`） |

## 语言错误

降级为纯文本时编辑器仍然可用，但宿主需要能观测到这件事 —— `language-error` 就是这个通道：

```vue
<script lang="ts" setup>
import type { CodeEditorLanguageError } from '@aiao/code-editor';
import { CodeEditor } from '@aiao/code-editor-vue';

function onLanguageError(error: CodeEditorLanguageError) {
  // 'not-found' 是配置错误，重试没有意义；'load-failed' 通常是网络或分包问题，可以重试。
  if (error.kind === 'load-failed') retry(error.language);
}
</script>

<template>
  <CodeEditor :language="lang" @language-error="onLanguageError" />
</template>
```

载荷形状（`kind` / `language` / `message` / `cause`）由核心包定义，三端一致：
Angular 是 `(aoLanguageError)` 输出，React 是 `onLanguageError` 回调。

## 模板 ref 用法

组件通过 `defineExpose` 暴露命令式 API，供模板 ref 访问底层 `EditorView`：

```vue
<script lang="ts" setup>
import { ref } from 'vue';
import { CodeEditor } from '@aiao/code-editor-vue';
import type { CodeEditorExpose } from '@aiao/code-editor-vue';

const editorRef = ref<CodeEditorExpose | null>(null);
const code = ref('const answer = 42;');

function focusEditor() {
  editorRef.value?.focus();
}
</script>

<template>
  <CodeEditor v-model:value="code" ref="editorRef" />
</template>
```

四个成员与 React 的 `CodeEditorHandle`、Angular 组件实例上的同名成员逐字对齐，跨端迁移时命令式面不需要改写：

| 成员    | 类型                     | 说明                                            |
| ------- | ------------------------ | ----------------------------------------------- |
| `view`  | `EditorView \| null`     | 底层 CodeMirror 实例，未挂载或已卸载时为 `null` |
| `host`  | `HTMLDivElement \| null` | 宿主 `div` 元素，未挂载或已卸载时为 `null`      |
| `focus` | `() => void`             | 聚焦编辑器内容区域                              |
| `blur`  | `() => void`             | 使编辑器内容区域失焦                            |

## 公开类型

```ts
import type {
  CodeEditorEmits,
  CodeEditorExpose,
  CodeEditorProps,
  CodeEditorSetup,
  CodeEditorTheme
} from '@aiao/code-editor-vue';
```
