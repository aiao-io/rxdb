# codeEditorLanguageLoadFailed()

```ts
function codeEditorLanguageLoadFailed(language, cause): CodeEditorLanguageError;
```

Defined in: [language-error.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L64)

Builds the "language load failed" error payload.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `language` | `string` | The language name whose load failed |
| `cause` | `unknown` | The loader's rejection value, passed through as-is — no `Error` wrapping, otherwise the host loses the original network error code or chunk load error |

## Returns

[`CodeEditorLanguageError`](../interfaces/CodeEditorLanguageError.md)

Payload with `kind` `'load-failed'`
