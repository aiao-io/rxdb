# MSTime

```ts
type MSTime = 
  | `${number}`
  | `${number}${MSUnitAnyCase}`
  | `${number} ${MSUnitAnyCase}`;
```

Defined in: [packages/utils/src/date/msTimeToMilliseconds.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/date/msTimeToMilliseconds.ts#L58)

An `ms` time string.

Structurally equivalent to `ms.StringValue` from the `ms@3` era, but does not reference the `ms` package's type exports: ms@2.1.3 ships no declarations, and utils' package.json does not list `@types/ms` as a dependency — it compiles in this workspace only because of the same-named root devDependency as a global fallback. If `ms.StringValue` were written verbatim into the public types, the published `.d.ts` would force independent consumers to install `@types/ms` themselves, raising TS7016 under strict + skipLibCheck=false (RV-078). Building a same-shaped type here breaks that dependency; the literal set covers the same inputs as the original type and whatever `ms()` can actually parse, making it a transparent replacement for existing callers.
