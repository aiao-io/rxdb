# CodeEditorLanguageErrorKind

```ts
type CodeEditorLanguageErrorKind = 'not-found' | 'load-failed';
```

Defined in: [language-error.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/language-error.ts#L28)

Category of a language failure.

- `not-found`: the language name cannot be found in the candidate list — a **configuration error**; the host should fix its configuration.
- `load-failed`: the language was found but `load()` rejected — usually a **network or chunk-loading problem**; the host may retry.

Deliberately two categories: retrying the former is pointless, while retrying the latter usually recovers.
