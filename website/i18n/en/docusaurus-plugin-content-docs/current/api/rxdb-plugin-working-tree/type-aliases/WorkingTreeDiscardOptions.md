# WorkingTreeDiscardOptions

```ts
type WorkingTreeDiscardOptions = WorkingTreeCredentials;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts#L49)

Input to one `discard()` call (contracts/core-api.md §3).

## Remarks

The key set is exactly the three captured positions. Any extra field is either a selection scope (the opening of item 1 above),
or `authorId` / `operationId` — and discard **does not write a commit**; giving it an author and an idempotency key
would imply the database keeps a record of "what someone discarded", and that record does not exist.
