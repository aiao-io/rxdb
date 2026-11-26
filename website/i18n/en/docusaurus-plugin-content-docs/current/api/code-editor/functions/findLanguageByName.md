# findLanguageByName()

```ts
function findLanguageByName(name, supportedLanguages?): 
  | CodeEditorLanguageDescription
  | null;
```

Defined in: [languages.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/languages.ts#L218)

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `name` | `string` | `undefined` |
| `supportedLanguages?` | readonly [`CodeEditorLanguageDescription`](../interfaces/CodeEditorLanguageDescription.md)[] | `SUPPORT_LANGUAGES` |

## Returns

  \| [`CodeEditorLanguageDescription`](../interfaces/CodeEditorLanguageDescription.md)
  \| `null`
