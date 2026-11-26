# Code editor

The `@aiao/code-editor` packages provide [CodeMirror 6](https://codemirror.net/)-based code editor components for Angular, React, and Vue, with a symmetric API.

## Packages

| Package                     | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `@aiao/code-editor`         | Core library, zero framework dependencies, multi-language support |
| `@aiao/code-editor-angular` | Angular component with `ngModel` two-way binding                  |
| `@aiao/code-editor-react`   | React component with controlled / uncontrolled modes              |
| `@aiao/code-editor-vue`     | Vue 3 component with `v-model` two-way binding                    |

## Supported languages

JavaScript, TypeScript, JSON, HTML, CSS, SQL, Markdown, Python, and other mainstream languages, switched through the `language` prop.

## Install

```bash npm2yarn
# Core library (required)
npm install @aiao/code-editor

# Pick one per framework
npm install @aiao/code-editor-angular
npm install @aiao/code-editor-react
npm install @aiao/code-editor-vue
```

## Angular

```typescript
import { CodeEditor } from '@aiao/code-editor-angular';

@NgModule({
  imports: [CodeEditor]
})
export class AppModule {}
```

```html
<ao-code-editor [(ngModel)]="code" language="typescript" theme="dark" />
```

## React

```tsx
import { CodeEditor } from '@aiao/code-editor-react';

function App() {
  const [code, setCode] = useState('// code');

  return <CodeEditor value={code} onChange={setCode} language="typescript" theme="dark" />;
}
```

## Vue

```vue
<script lang="ts" setup>
import { CodeEditor } from '@aiao/code-editor-vue';
import { ref } from 'vue';

const code = ref('// code');
</script>

<template>
  <CodeEditor v-model:value="code" language="typescript" theme="dark" />
</template>
```

## Core API (framework-agnostic)

```typescript
import { findLanguageByName, SUPPORT_LANGUAGES } from '@aiao/code-editor';

const language = findLanguageByName('typescript');
if (language === null) {
  throw new Error('Unsupported language');
}

const languageSupport = await language.load();
const availableLanguageNames = SUPPORT_LANGUAGES.map(item => item.name);
```

The core package only provides shared language descriptions and theme types; it does not create editor instances. EditorView lifecycle is managed by the Angular, React, or Vue component.

## Props reference

| Prop       | Type                  | Default   | Description                     |
| ---------- | --------------------- | --------- | ------------------------------- |
| `value`    | `string`              | `''`      | Editor content                  |
| `language` | `string`              | `'sql'`   | Language mode                   |
| `theme`    | `'light' \| 'dark'`   | `'light'` | Theme                           |
| `readonly` | `boolean`             | `false`   | Read-only mode                  |
| `onChange` | `(v: string) => void` | —         | Content change callback (React) |

## References

- [CodeMirror 6 docs](https://codemirror.net/docs/)
