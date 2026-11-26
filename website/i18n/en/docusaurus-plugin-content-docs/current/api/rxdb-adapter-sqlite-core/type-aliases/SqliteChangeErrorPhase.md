# SqliteChangeErrorPhase

```ts
type SqliteChangeErrorPhase = 'query' | 'process';
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L65)

Phase at which change handling failed

- `query`: reading the changed row back failed; the content of this change is entirely unknown
- `process`: the row was read, but conversion or entity event dispatch failed
