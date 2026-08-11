# @aiao/code-editor-react

基于 CodeMirror 6 的 React 代码编辑器组件。

## 功能

- 亮色与暗色主题
- 动态切换 `basic` / `minimal` setup
- 内置或自定义语言列表
- 只读、禁用、占位文本、缩进、换行与空白高亮
- `className`、`style`、`aria-*`、`data-*`、焦点事件等宿主 `div` 属性透传
- 支持 `Document` 与 `ShadowRoot`

## 安装

```bash
pnpm add @aiao/code-editor @aiao/code-editor-react
```

## 基础用法

```tsx
import { useState } from 'react';
import { CodeEditor } from '@aiao/code-editor-react';

export function App() {
  const [code, setCode] = useState('SELECT * FROM users');

  return (
    <CodeEditor
      aria-label="SQL editor"
      className="query-editor"
      language="sql"
      onBlur={() => console.log('blur')}
      onChange={setCode}
      onFocus={() => console.log('focus')}
      setup="basic"
      style={{ minHeight: 240 }}
      theme="dark"
      value={code}
    />
  );
}
```

`value` 在外部属性变化时同步到 CodeMirror，并通过 `onChange` 上报用户编辑。它不是原生
`input` 那种强制回滚的严格受控语义：如果父组件忽略 `onChange` 且不重新渲染，编辑器会保留用户输入。

## 自定义语言列表

```tsx
import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import { CodeEditor } from '@aiao/code-editor-react';

export function SqlEditor() {
  return <CodeEditor language="sql" languages={SUPPORT_LANGUAGES} />;
}
```

传入空数组会清除语言扩展；未知语言或加载失败会回退到纯文本并输出错误。

## 语言错误

降级为纯文本时编辑器仍然可用，但宿主需要能观测到这件事 —— `onLanguageError` 就是这个通道：

```tsx
import type { CodeEditorLanguageError } from '@aiao/code-editor';

<CodeEditor
  language={lang}
  onLanguageError={(error: CodeEditorLanguageError) => {
    // 'not-found' 是配置错误，重试没有意义；'load-failed' 通常是网络或分包问题，可以重试。
    if (error.kind === 'load-failed') retry(error.language);
  }}
/>;
```

载荷形状（`kind` / `language` / `message` / `cause`）由核心包定义，三端一致：
Angular 是 `(aoLanguageError)` 输出，Vue 是 `@language-error` 事件。

## 初始化选项

`root` 和 `autoFocus` 只在 CodeMirror 实例创建时读取。需要更换根节点时，应使用新的 React `key`
重新挂载组件。其余编辑器选项可在运行时更新。

```tsx
<CodeEditor autoFocus key={shadowRoot === undefined ? 'document' : 'shadow'} root={shadowRoot} />
```

## ref 用法

`CodeEditor` 是 React 19 的普通函数组件，无需 `forwardRef` 即可直接接收 `ref`；组件通过
`useImperativeHandle` 暴露命令式 API，而非把 `ref` 转发到宿主 `div`：

```tsx
import { useRef } from 'react';
import { CodeEditor, type CodeEditorHandle } from '@aiao/code-editor-react';

export function App() {
  const editorRef = useRef<CodeEditorHandle>(null);

  return (
    <>
      <CodeEditor language="sql" ref={editorRef} value="SELECT 1" />
      <button onClick={() => editorRef.current?.focus()}>Focus</button>
    </>
  );
}
```

| 成员    | 类型                     | 说明                                            |
| ------- | ------------------------ | ----------------------------------------------- |
| `view`  | `EditorView \| null`     | 底层 CodeMirror 实例，未挂载或已卸载时为 `null` |
| `host`  | `HTMLDivElement \| null` | 宿主 `div` 元素，未挂载或已卸载时为 `null`      |
| `focus` | `() => void`             | 聚焦编辑器内容区域                              |
| `blur`  | `() => void`             | 使编辑器内容区域失焦                            |
