# resolveCodeEditorLanguage()

```ts
function resolveCodeEditorLanguage(name, languages): ResolvedCodeEditorLanguage;
```

Defined in: [language-resolution.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-resolution.ts#L71)

Resolves the language description that should currently be used.

## Parameters

| Parameter   | Type                                                                                         | Description                                                                    |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`      | `string`                                                                                     | Language name or alias; an empty string and `'plaintext'` mean no highlighting |
| `languages` | readonly [`CodeEditorLanguageDescription`](../interfaces/CodeEditorLanguageDescription.md)[] | Candidate language list; an empty list means no highlighting                   |

## Returns

[`ResolvedCodeEditorLanguage`](../type-aliases/ResolvedCodeEditorLanguage.md)

The discriminated resolution result; see [ResolvedCodeEditorLanguage](../type-aliases/ResolvedCodeEditorLanguage.md)

## Remarks

A pure function that neither logs nor throws: "not found" is a branch of the return value, and the caller decides how to report it — the three frameworks express error channels differently (output / callback prop / emit), so hardcoding `console.error` here would prevent unification.

## Example

```ts
resolveCodeEditorLanguage('ts', SUPPORT_LANGUAGES); // `{ kind: 'found', description: … }`
resolveCodeEditorLanguage('plaintext', SUPPORT_LANGUAGES); // `{ kind: 'none' }`
resolveCodeEditorLanguage('nope', SUPPORT_LANGUAGES); // `{ kind: 'not-found', name: 'nope' }`
```
