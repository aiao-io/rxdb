# isSameResolvedLanguage()

```ts
function isSameResolvedLanguage(left, right): boolean;
```

Defined in: [language-resolution.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-resolution.ts#L101)

Determines whether two resolution results are equivalent — equivalent means "no need to reload or reconfigure the language".

## Parameters

| Parameter | Type                                                                                            | Description                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `left`    | \| [`ResolvedCodeEditorLanguage`](../type-aliases/ResolvedCodeEditorLanguage.md) \| `undefined` | The previously effective resolution result; `undefined` means nothing has been resolved yet |
| `right`   | [`ResolvedCodeEditorLanguage`](../type-aliases/ResolvedCodeEditorLanguage.md)                   | This resolution's result                                                                    |

## Returns

`boolean`

`true` when the two are equivalent

## Remarks

The `found` branch **compares only the description reference**, not the language name: `'TypeScript'` changed to the alias `'ts'` resolves to the same description, and rebuilding the parser would be pure waste.

The `not-found` branch compares the language name: switching from one wrong name to another wrong name must report the error again, otherwise the host only ever sees the first configuration error.

Note that this function does **not** decide "whether to force a reload". Callers that need a forced reload (for example the host swapped the loader implementation behind a same-named description) should call each framework's explicit imperative method instead of relying on passing an equivalent new array to create implicit side effects.
