# CodeEditorLanguageError

Defined in: [language-error.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L31)

Structured description of a language failure.

## Properties

### cause \{#cause\}

```ts
readonly cause: unknown;
```

Defined in: [language-error.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L39)

The loader's rejection value (any type) for `load-failed`; `undefined` for `not-found`.

---

### kind \{#kind\}

```ts
readonly kind: CodeEditorLanguageErrorKind;
```

Defined in: [language-error.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L33)

Failure category; see [CodeEditorLanguageErrorKind](../type-aliases/CodeEditorLanguageErrorKind.md).

---

### language \{#language\}

```ts
readonly language: string;
```

Defined in: [language-error.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L35)

The language name that triggered the failure, with case preserved so it can be shown to users directly.

---

### message \{#message\}

```ts
readonly message: string;
```

Defined in: [language-error.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L37)

Stable readable description, same wording across all three frameworks; not meant to be shown to end users directly — for logs and debugging only.
