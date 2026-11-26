# CodeEditorProps

Defined in: [code-editor-vue/src/code-editor.types.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L13)

Public props of the Vue CodeEditor.

## Remarks

Same name and semantics as Angular's inputs and React's props; the two initialization-only items ([CodeEditorProps.autoFocus](#autofocus) / [CodeEditorProps.root](#root)) are marked on their own entries.

## Properties

### autoFocus? \{#autofocus\}

```ts
readonly autoFocus?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L21)

Focuses the editor immediately after mount.

#### Default Value

```ts
false;
```

#### Remarks

**Read once at mount**; later changes are ignored. Does not grab focus when `disabled` or `readonly` is true — otherwise the user gets a control that cannot be typed into and gives no clue why.

---

### describedBy? \{#describedby\}

```ts
readonly describedBy?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L28)

Id of the supplementary description element, written as the inner textbox's `aria-describedby`.

#### Remarks

The attribute lands on CodeMirror's `.cm-content` — that's the element carrying `role="textbox"`, not the component's host element. Empty strings are treated as "unset". Same name and semantics across all three frameworks.

---

### disabled? \{#disabled\}

```ts
readonly disabled?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L36)

Disabled: read-only and non-editable, and reports `aria-disabled` to assistive technology.

#### Default Value

```ts
false;
```

#### Remarks

Independent from `readonly`; either being true makes the editor non-editable. The difference is that disabled also writes `aria-disabled` and suppresses `autoFocus`.

---

### highlightWhitespace? \{#highlightwhitespace\}

```ts
readonly highlightWhitespace?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L42)

Shows whitespace characters.

#### Default Value

```ts
false;
```

---

### indentUnit? \{#indentunit\}

```ts
readonly indentUnit?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L48)

The string used for one level of indentation.

#### Default Value

```ts
'  ' (two spaces, consistent across all three frameworks)
```

---

### indentWithTab? \{#indentwithtab\}

```ts
readonly indentWithTab?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L56)

Allows Tab-key indentation.

#### Default Value

```ts
false;
```

#### Remarks

When enabled, Tab no longer moves focus and keyboard users get stuck in the editor — an accessibility trade-off, turned off consistently by default across all three frameworks.

---

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L79)

Accessible name, written as the inner textbox's `aria-label`.

#### Remarks

Lands in the same place as [CodeEditorProps.describedBy](#describedby).

---

### labelledBy? \{#labelledby\}

```ts
readonly labelledBy?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L85)

Id of the element acting as the label, written as the inner textbox's `aria-labelledby`.

#### Remarks

Lands in the same place as [CodeEditorProps.describedBy](#describedby).

---

### language? \{#language\}

```ts
readonly language?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L64)

Language name or alias for syntax highlighting; `''` and `'plaintext'` mean no highlighting.

#### Default Value

```ts
'sql';
```

#### Remarks

When not found or when `load()` fails, it **degrades to plain text** and stays usable, and emits the `language-error` event (see [CodeEditorEmits](CodeEditorEmits.md)). When switching rapidly, only the last request takes effect.

---

### languages? \{#languages\}

```ts
readonly languages?: readonly CodeEditorLanguageDescription[];
```

Defined in: [code-editor-vue/src/code-editor.types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L73)

Candidate language list; an empty list means no highlighting.

#### Default Value

```ts
SUPPORT_LANGUAGES;
```

#### Remarks

Passing an inline literal (`:languages="[myLang]"`) has a cost: every update round is a new array, and `watch` triggers by reference. The component then re-checks whether the description resolved for the current language really changed — it only re-runs `load()` when it did, but the check itself still runs; a stable reference (a module-level constant or `computed`) is cheaper.

---

### lineWrapping? \{#linewrapping\}

```ts
readonly lineWrapping?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L91)

Line wrapping.

#### Default Value

```ts
false;
```

---

### placeholder? \{#placeholder\}

```ts
readonly placeholder?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L97)

Placeholder text shown when the document is empty.

#### Default Value

```ts
'';
```

---

### readonly? \{#readonly\}

```ts
readonly readonly?: boolean;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L105)

Read-only: still focusable, selectable, and copyable, but not editable.

#### Default Value

```ts
false;
```

#### Remarks

Only blocks editing **commands**, not host sync — `value` changes are still written into the document, otherwise the controlled read-only usage would break outright.

---

### root? \{#root\}

```ts
readonly root?: Document | ShadowRoot;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L112)

The DOM root CodeMirror is mounted in, for Shadow DOM scenarios.

#### Remarks

**Read once at mount** — CodeMirror cannot change root after construction. To change root, force a component rebuild with `v-if` or `:key`.

---

### setup? \{#setup\}

```ts
readonly setup?: CodeEditorSetup;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L118)

CodeMirror preset extension set; `null` means no presets are loaded.

#### Default Value

```ts
'basic';
```

---

### theme? \{#theme\}

```ts
readonly theme?: CodeEditorTheme;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L124)

Theme.

#### Default Value

```ts
'light';
```

---

### value? \{#value\}

```ts
readonly value?: string;
```

Defined in: [code-editor-vue/src/code-editor.types.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor-vue/src/code-editor.types.ts#L133)

Document content, used together with `v-model:value`.

#### Default Value

```ts
'';
```

#### Remarks

**Not strictly controlled**: the component does not write user edits back into this prop, nor does it force-flatten the document on every update. When this prop changes, only the delta between the common prefix and suffix is synced; cursor, selection, and scroll position are preserved and it does not enter the undo stack. When the parent ignores `update:value`, the editor keeps the user's input.
