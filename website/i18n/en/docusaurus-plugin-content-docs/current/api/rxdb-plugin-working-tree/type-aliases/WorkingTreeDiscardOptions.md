# WorkingTreeDiscardOptions

```ts
type WorkingTreeDiscardOptions = WorkingTreeCredentials;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts#L49)

The arguments of a `discard()` call (contracts/core-api.md §3).

## Remarks

The key set is exactly the three captured slots. Any extra field is either a selection range (the opening in
item 1 above), or `authorId` / `operationId` — and discard **writes no commit**; giving it an author and an
idempotence key would imply the database keeps a record of "who discarded what", and that record does not exist.
