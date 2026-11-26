# SUPPORT_LANGUAGES

```ts
const SUPPORT_LANGUAGES: readonly LanguageDescription[];
```

Defined in: [languages.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L213)

All built-in language descriptions: upstream `@codemirror/language-data` languages plus the 15 covered by this repo.

## Remarks

The type deliberately stays CodeMirror's `LanguageDescription` instead of this package's structured [CodeEditorLanguageDescription](../interfaces/CodeEditorLanguageDescription.md). The latter lacks `LanguageDescription`'s private fields (`loadFunc` / `loading`), the nominal type cannot flow back, and feeding this array to `LanguageDescription.matchFilename()` / `matchLanguageName()` fails to compile outright (CE-001) — yet matching a language by file name is the most common consumer usage.

`satisfies` guarantees it still meets the structural constraints this package promises publicly (the three frameworks' `languages` properties use it as their **input** type), while leaving the inferred type as `readonly LanguageDescription[]`.
