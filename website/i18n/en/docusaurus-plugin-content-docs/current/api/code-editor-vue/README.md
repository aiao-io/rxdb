# code-editor-vue

A Vue 3 code editor component based on CodeMirror 6.

## Installation

```bash
pnpm add @aiao/code-editor-vue
```

## Usage

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

`v-model:value` syncs `value` / `update:value`. `change` only fires on user edits; external `value` updates don't fire it back.

## Props

| Prop                  | Type                                       | Default             | Behavior                                    |
| --------------------- | ------------------------------------------ | ------------------- | ------------------------------------------- |
| `value`               | `string`                                   | `''`                | dynamic sync                                |
| `theme`               | `'light' \| 'dark'`                        | `'light'`           | dynamic reconfigure                         |
| `language`            | `string`                                   | `'sql'`             | dynamic async load                          |
| `languages`           | `readonly CodeEditorLanguageDescription[]` | `SUPPORT_LANGUAGES` | dynamically replaces the language list      |
| `placeholder`         | `string`                                   | `''`                | dynamic reconfigure                         |
| `readonly`            | `boolean`                                  | `false`             | dynamic reconfigure                         |
| `disabled`            | `boolean`                                  | `false`             | dynamic reconfigure                         |
| `setup`               | `'basic' \| 'minimal'`                     | `'basic'`           | dynamic reconfigure                         |
| `indentWithTab`       | `boolean`                                  | `false`             | dynamic reconfigure                         |
| `indentUnit`          | `string`                                   | `'  '`              | dynamic reconfigure                         |
| `lineWrapping`        | `boolean`                                  | `false`             | dynamic reconfigure                         |
| `highlightWhitespace` | `boolean`                                  | `false`             | dynamic reconfigure                         |
| `autoFocus`           | `boolean`                                  | `false`             | read at initialization only                 |
| `root`                | `Document \| ShadowRoot`                   | `undefined`         | passed to the editor at initialization only |

An empty string or `plaintext` clears the language extension. Unknown languages and load failures **degrade to plain text** and emit `language-error` (see below); the editor itself stays usable. When switching languages rapidly, only the last request may update the current editor.

Custom language lists use the public types of the core package:

```ts
import type { CodeEditorLanguageDescription } from '@aiao/code-editor';

declare const myLanguage: CodeEditorLanguageDescription;
const languages: readonly CodeEditorLanguageDescription[] = [myLanguage];
```

```vue
<CodeEditor v-model:value="code" :languages="languages" language="my-language" />
```

## Events

| Event            | Arguments                          | When it fires                                                       |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `update:value`   | `(value: string)`                  | the user edits the document                                         |
| `change`         | `(value: string)`                  | the user edits the document                                         |
| `focus`          | `()`                               | the editor content area gains focus                                 |
| `blur`           | `()`                               | the editor content area loses focus                                 |
| `language-error` | `(error: CodeEditorLanguageError)` | language not found (`not-found`) or `load()` failed (`load-failed`) |

## Language errors

The editor stays usable when degraded to plain text, but the host needs to be able to observe it — `language-error` is that channel:

```vue
<script lang="ts" setup>
import type { CodeEditorLanguageError } from '@aiao/code-editor';
import { CodeEditor } from '@aiao/code-editor-vue';

function onLanguageError(error: CodeEditorLanguageError) {
  // 'not-found' is a configuration error and retrying is pointless; 'load-failed' is usually a network or chunk-loading problem and can be retried.
  if (error.kind === 'load-failed') retry(error.language);
}
</script>

<template>
  <CodeEditor :language="lang" @language-error="onLanguageError" />
</template>
```

The payload shape (`kind` / `language` / `message` / `cause`) is defined by the core package and consistent across all three frameworks: it's the `(aoLanguageError)` output in Angular and the `onLanguageError` callback in React.

## Template ref usage

The component exposes an imperative API via `defineExpose` so template refs can reach the underlying `EditorView`:

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

The four members are verbatim-aligned with React's `CodeEditorHandle` and the same-named members on the Angular component instance; the imperative surface needs no rewrite when migrating across frameworks:

| Member  | Type                     | Description                                                           |
| ------- | ------------------------ | --------------------------------------------------------------------- |
| `view`  | `EditorView \| null`     | The underlying CodeMirror instance; `null` when unmounted or unloaded |
| `host`  | `HTMLDivElement \| null` | The host `div` element; `null` when unmounted or unloaded             |
| `focus` | `() => void`             | Focuses the editor content area                                       |
| `blur`  | `() => void`             | Blurs the editor content area                                         |

## Public types

```ts
import type {
  CodeEditorEmits,
  CodeEditorExpose,
  CodeEditorProps,
  CodeEditorSetup,
  CodeEditorTheme
} from '@aiao/code-editor-vue';
```

## Interfaces

| Interface                                          | Description                                                    |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [CodeEditorEmits](interfaces/CodeEditorEmits.md)   | Public events of the Vue CodeEditor.                           |
| [CodeEditorExpose](interfaces/CodeEditorExpose.md) | The imperative API exposed by `defineExpose` to template refs. |
| [CodeEditorProps](interfaces/CodeEditorProps.md)   | Public props of the Vue CodeEditor.                            |

## Type Aliases

| Type Alias                                         | Description                      |
| -------------------------------------------------- | -------------------------------- |
| [CodeEditorSetup](type-aliases/CodeEditorSetup.md) | CodeMirror preset extension set. |
| [CodeEditorTheme](type-aliases/CodeEditorTheme.md) | CodeEditor theme type            |

## Variables

| Variable                              | Description |
| ------------------------------------- | ----------- |
| [CodeEditor](variables/CodeEditor.md) | -           |
