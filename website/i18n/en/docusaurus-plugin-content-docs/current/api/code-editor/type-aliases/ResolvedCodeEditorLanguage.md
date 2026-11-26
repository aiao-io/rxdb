# ResolvedCodeEditorLanguage

```ts
type ResolvedCodeEditorLanguage = 
  | {
  kind: "none";
}
  | {
  kind: "not-found";
  name: string;
}
  | {
  description: CodeEditorLanguageDescription;
  kind: "found";
};
```

Defined in: [language-resolution.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-resolution.ts#L31)

Result of one language resolution.

The three branches correspond to the editor's three dispositions: install the language extension (`found`), clear the language extension (`none`), clear it and report a configuration error (`not-found`). Deliberately a discriminated union instead of `CodeEditorLanguageDescription | null` — the latter collapses "explicitly no highlighting" and "misconfigured" into one value, leaving the caller unable to tell whether to report an error.

## Union Members

### Type Literal

```ts
{
  kind: "none";
}
```

#### kind

```ts
readonly kind: "none";
```

Explicitly no syntax highlighting needed: the language name is empty, is `'plaintext'`, or the candidate list is empty.

***

### Type Literal

```ts
{
  kind: "not-found";
  name: string;
}
```

#### kind

```ts
readonly kind: "not-found";
```

The language name cannot be found in the candidate list — a configuration error; the caller should report it to the host.

#### name

```ts
readonly name: string;
```

The language name that could not be resolved, with case preserved so it can appear in error messages.

***

### Type Literal

```ts
{
  description: CodeEditorLanguageDescription;
  kind: "found";
}
```

#### description

```ts
readonly description: CodeEditorLanguageDescription;
```

The matching language description; `load()` is initiated by the caller under its own race rules.

#### kind

```ts
readonly kind: "found";
```

Resolution succeeded.
