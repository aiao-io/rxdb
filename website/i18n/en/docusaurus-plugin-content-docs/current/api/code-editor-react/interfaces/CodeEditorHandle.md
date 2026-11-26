# CodeEditorHandle

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L42)

CodeEditor imperative handle.

## Properties

### host \{#host\}

```ts
readonly host: HTMLDivElement | null;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L46)

The host div element; null when unmounted or unloaded.

---

### view \{#view\}

```ts
readonly view: EditorView | null;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L44)

The underlying CodeMirror EditorView; null when unmounted or unloaded.

## Methods

### blur() \{#blur\}

```ts
blur(): void;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L47)

#### Returns

`void`

---

### focus() \{#focus\}

```ts
focus(): void;
```

Defined in: [packages/code-editor-react/src/CodeEditor.tsx:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-react/src/CodeEditor.tsx#L48)

#### Returns

`void`
