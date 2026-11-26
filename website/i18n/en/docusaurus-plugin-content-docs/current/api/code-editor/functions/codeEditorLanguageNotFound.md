# codeEditorLanguageNotFound()

```ts
function codeEditorLanguageNotFound(language): CodeEditorLanguageError;
```

Defined in: [language-error.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L48)

Builds the "language name not found" error payload.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `language` | `string` | The language name that could not be resolved |

## Returns

[`CodeEditorLanguageError`](../interfaces/CodeEditorLanguageError.md)

Payload with `kind` `'not-found'` and `cause` `undefined`
