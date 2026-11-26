# JSON

```ts
const JSON: LanguageDescription;
```

Defined in: [languages.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L107)

JSON language description backed by the **strict JSON** parser from `@codemirror/lang-json`.

## Remarks

The `json5` in `alias` is a **file type alias** and does not mean JSON5 syntax support. It comes from upstream `@codemirror/language-data` — upstream likewise binds `json5` to the strict JSON parser; the CodeMirror ecosystem has no ready-made JSON5 parser. Therefore the editor obtained from `findLanguageByName('json5')` **produces error nodes** when it encounters JSON5 comments, unquoted keys, and trailing commas — visible as broken syntax highlighting and lint errors (CE-003).

For a real JSON5 editing experience, implement `CodeEditorLanguageDescription` yourself and pass it through each framework's `languages` property — this package does not silently downgrade.
