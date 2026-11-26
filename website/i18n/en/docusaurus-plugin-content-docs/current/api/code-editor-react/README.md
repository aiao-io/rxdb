# code-editor-react

A React code editor component based on CodeMirror 6.

## Features

- Light and dark themes
- Dynamically switch `basic` / `minimal` setup
- Built-in or custom language lists
- Read-only, disabled, placeholder text, indentation, line wrapping, and whitespace highlighting
- Host `div` attribute pass-through: `className`, `style`, `aria-*`, `data-*`, focus events, etc.
- Supports `Document` and `ShadowRoot`

## Installation

```bash
pnpm add @aiao/code-editor @aiao/code-editor-react
```

## Basic usage

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

`value` syncs into CodeMirror when the external prop changes, and user edits are reported via `onChange`. It is not the strict controlled semantics of a native `input` with forced rollback: if the parent ignores `onChange` and does not re-render, the editor keeps the user's input.

Inside React `<Activity>`, hiding destroys the CodeMirror instance and a new one is created on re-show, but the editor state (text, selection, undo history) is kept with the component state: after re-show you continue editing from the pre-hide state, and the `view` obtained from `ref` is a new instance. If `value` changed while hidden, a delta sync under the same rules runs on re-show; if unchanged, `value` does not overwrite the pre-hide document.

## Custom language lists

```tsx
import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import { CodeEditor } from '@aiao/code-editor-react';

export function SqlEditor() {
  return <CodeEditor language="sql" languages={SUPPORT_LANGUAGES} />;
}
```

Passing an empty array clears the language extension; unknown languages or load failures fall back to plain text and report the error.

## Language errors

The editor stays usable when degraded to plain text, but the host needs to be able to observe it — `onLanguageError` is that channel:

```tsx
import type { CodeEditorLanguageError } from '@aiao/code-editor';

<CodeEditor
  language={lang}
  onLanguageError={(error: CodeEditorLanguageError) => {
    // 'not-found' is a configuration error and retrying is pointless; 'load-failed' is usually a network or chunk-loading problem and can be retried.
    if (error.kind === 'load-failed') retry(error.language);
  }}
/>;
```

The payload shape (`kind` / `language` / `message` / `cause`) is defined by the core package and consistent across all three frameworks: it's the `(aoLanguageError)` output in Angular and the `@language-error` event in Vue.

## Initialization options

`root` and `autoFocus` are read only when the CodeMirror instance is created. To change the root node, remount the component with a new React `key`. All other editor options can be updated at runtime.

```tsx
<CodeEditor autoFocus key={shadowRoot === undefined ? 'document' : 'shadow'} root={shadowRoot} />
```

## ref usage

`CodeEditor` is a plain function component on React 19 and accepts `ref` directly without `forwardRef`; the component exposes an imperative API via `useImperativeHandle` instead of forwarding `ref` to the host `div`:

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

| Member  | Type                     | Description                                                           |
| ------- | ------------------------ | --------------------------------------------------------------------- |
| `view`  | `EditorView \| null`     | The underlying CodeMirror instance; `null` when unmounted or unloaded |
| `host`  | `HTMLDivElement \| null` | The host `div` element; `null` when unmounted or unloaded             |
| `focus` | `() => void`             | Focuses the editor content area                                       |
| `blur`  | `() => void`             | Blurs the editor content area                                         |

## Interfaces

| Interface                                          | Description                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CodeEditorHandle](interfaces/CodeEditorHandle.md) | CodeEditor imperative handle.                                                                                                                                                           |
| [CodeEditorProps](interfaces/CodeEditorProps.md)   | Props of `CodeEditor`. Unlisted props pass through to the host `div` (`className` / `style` / `data-*` / DOM events, etc.), except `children` / `dangerouslySetInnerHTML` / `onChange`. |

## Type Aliases

| Type Alias                                         | Description           |
| -------------------------------------------------- | --------------------- |
| [CodeEditorSetup](type-aliases/CodeEditorSetup.md) | -                     |
| [CodeEditorTheme](type-aliases/CodeEditorTheme.md) | CodeEditor theme type |

## Functions

| Function                              | Description             |
| ------------------------------------- | ----------------------- |
| [CodeEditor](functions/CodeEditor.md) | @aiao/code-editor-react |
