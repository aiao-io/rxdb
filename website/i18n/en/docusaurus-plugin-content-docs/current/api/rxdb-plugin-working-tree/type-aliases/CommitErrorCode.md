# CommitErrorCode

```ts
type CommitErrorCode = (typeof CommitErrorCode)[keyof typeof CommitErrorCode];
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-error-codes.ts#L36)

The value union of [CommitErrorCode](../variables/CommitErrorCode.md)

## Remarks

Merged with the constant declaration of the same name, so `CommitErrorCode` works both as a value
(`CommitErrorCode.xxx`) and as a type — it feels like an enum to write, but the member types are plain string
literals rather than nominal types.
