# CodeEditorEmits

Defined in: [code-editor-vue/src/code-editor.types.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L137)

Public events of the Vue CodeEditor.

## Properties

### blur \{#blur\}

```ts
blur: [];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L139)

The editor content area loses focus.

***

### change \{#change\}

```ts
change: [value: string];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L141)

Content change caused by user editing; programmatic writes by the host via `value` do **not** trigger it.

***

### focus \{#focus\}

```ts
focus: [];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L143)

The editor content area gains focus.

***

### language-error \{#language-error\}

```ts
"language-error": [error: CodeEditorLanguageError];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L155)

Language resolution or loading failed.

#### Remarks

CEV-004: this path previously only had a `console.error`, completely unobservable to the host — no error to grab, no chance to retry or degrade, the user just sees highlighting suddenly vanish. The degradation strategy is unchanged (clear the language extension and fall back to plain text) and the log is kept; this event is the **newly added** observation channel. The payload is defined by the core package and verbatim-identical to Angular's `aoLanguageError` output and React's `onLanguageError` callback: when `kind` is `'not-found'` it is a configuration error and retrying is pointless; when `'load-failed'` it is usually a network or chunk-loading problem and can be retried.

***

### update:value \{#updatevalue\}

```ts
"update:value": [value: string];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L157)

The update channel of `v-model:value`; fires at the same time as `change`.
