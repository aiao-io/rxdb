# @aiao/code-editor

CodeMirror 6 编辑器绑定共享的语言描述与主题类型。

## 功能特性

- **多语言描述**：JavaScript、TypeScript、JSON、HTML、CSS、SQL、Markdown、Python 等
- **按需加载**：语言解析器通过 `LanguageDescription.load()` 动态加载
- **统一查找**：按语言名称或别名进行大小写不敏感查找
- **零框架依赖**：供 Angular、React、Vue 或其他 CodeMirror 6 集成复用

## 何时使用

- 需要为 CodeMirror 6 编辑器加载语言支持
- 需要在多个框架绑定之间共享同一份语言列表
- 需要向框架绑定传入自定义语言描述

## 框架集成

本包不创建编辑器实例。完整组件请使用：

- Angular: `@aiao/code-editor-angular`
- React: `@aiao/code-editor-react`
- Vue: `@aiao/code-editor-vue`

## 安装

```bash
npm install @aiao/code-editor
# 或
pnpm add @aiao/code-editor
```

## 使用

```typescript
import { findLanguageByName, SUPPORT_LANGUAGES } from '@aiao/code-editor';

const language = findLanguageByName('typescript');

if (language === null) {
  throw new Error('Unsupported language');
}

const languageSupport = await language.load();
const availableLanguageNames = SUPPORT_LANGUAGES.map(item => item.name);
```

`findLanguageByName()` 只匹配语言名称和别名，不按文件扩展名或文件名查找。返回的 `languageSupport` 可作为 CodeMirror 扩展交给具体框架绑定或编辑器状态。

按文件名查找请直接用 CodeMirror 的静态方法，`SUPPORT_LANGUAGES` 可直接作为入参：

```typescript
import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import { LanguageDescription } from '@codemirror/language';

LanguageDescription.matchFilename(SUPPORT_LANGUAGES, 'icon.svg'); // XML
```

本包覆盖的语言描述会合并上游 `@codemirror/language-data` 的别名、扩展名与文件名正则，匹配范围是上游的超集。

## 别名不等于语法支持

`json5` 是 JSON 描述的**文件类型别名**（与上游 `@codemirror/language-data` 一致），解析器仍是严格的 `@codemirror/lang-json`。用它打开 JSON5 文件时，注释、无引号键、尾逗号都会产生错误节点，表现为高亮中断与 lint 报错。

需要真正的 JSON5 编辑体验，请自行实现 `CodeEditorLanguageDescription` 并通过框架绑定的 `languages` 属性传入 —— 本包不做静默降级。

## 完整示例

- [Angular 示例](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular)
- [React 示例](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-react)
- [Vue 示例](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-vue)
