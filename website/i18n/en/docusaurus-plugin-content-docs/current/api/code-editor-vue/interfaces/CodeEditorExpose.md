# CodeEditorExpose

Defined in: [code-editor-vue/src/code-editor.types.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L166)

The imperative API exposed by `defineExpose` to template refs.

## Remarks

The four members are verbatim-aligned with React's `CodeEditorHandle` and the same-named members on the Angular component instance (CEA-009) — the imperative surface needs no rewrite when migrating across frameworks.

## Properties

### host \{#host\}

```ts
readonly host: HTMLDivElement | null;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L170)

The host `div` element (the container CodeMirror is mounted in); null when unmounted or unloaded.

***

### view \{#view\}

```ts
readonly view: EditorView | null;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L168)

The underlying CodeMirror EditorView; null when unmounted or unloaded.

## Methods

### blur() \{#blur\}

```ts
blur(): void;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L172)

Removes keyboard focus; no-op when unmounted.

#### Returns

`void`

***

### focus() \{#focus\}

```ts
focus(): void;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L174)

Hands keyboard focus to the editor content area; no-op when unmounted.

#### Returns

`void`
