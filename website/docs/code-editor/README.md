# 代码编辑器

`@aiao/code-editor` 系列提供基于 [CodeMirror 6](https://codemirror.net/) 的代码编辑器组件，支持 Angular、React、Vue 三端，API 对称。

## 包结构

| 包                          | 说明                                  |
| --------------------------- | ------------------------------------- |
| `@aiao/code-editor`         | 核心库，零框架依赖，多语言支持        |
| `@aiao/code-editor-angular` | Angular 组件，支持 `ngModel` 双向绑定 |
| `@aiao/code-editor-react`   | React 组件，支持受控 / 非受控模式     |
| `@aiao/code-editor-vue`     | Vue 3 组件，支持 `v-model` 双向绑定   |

## 支持的语言

JavaScript、TypeScript、JSON、HTML、CSS、SQL、Markdown、Python 等主流语言，通过 `language` prop 切换。

## 安装

```bash npm2yarn
# 核心库（必须）
npm install @aiao/code-editor

# 按框架选其一
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
  const [code, setCode] = useState('// 代码');

  return <CodeEditor value={code} onChange={setCode} language="typescript" theme="dark" />;
}
```

## Vue

```vue
<script lang="ts" setup>
import { CodeEditor } from '@aiao/code-editor-vue';
import { ref } from 'vue';

const code = ref('// 代码');
</script>

<template>
  <CodeEditor v-model:value="code" language="typescript" theme="dark" />
</template>
```

## 核心 API（框架无关）

```typescript
import { findLanguageByName, SUPPORT_LANGUAGES } from '@aiao/code-editor';

const language = findLanguageByName('typescript');
if (language === null) {
  throw new Error('Unsupported language');
}

const languageSupport = await language.load();
const availableLanguageNames = SUPPORT_LANGUAGES.map(item => item.name);
```

核心包只提供共享语言描述和主题类型，不创建编辑器实例。EditorView 生命周期由 Angular、React 或 Vue 组件管理。

## Props 参考

| Prop       | 类型                  | 默认值        | 说明                     |
| ---------- | --------------------- | ------------- | ------------------------ |
| `value`    | `string`              | `''`          | 编辑器内容               |
| `language` | `string`              | `'plaintext'` | 语言模式                 |
| `theme`    | `'light' \| 'dark'`   | `'light'`     | 主题                     |
| `readOnly` | `boolean`             | `false`       | 只读模式                 |
| `onChange` | `(v: string) => void` | —             | 内容变化回调（React 用） |

## 参考

- [CodeMirror 6 文档](https://codemirror.net/docs/)
