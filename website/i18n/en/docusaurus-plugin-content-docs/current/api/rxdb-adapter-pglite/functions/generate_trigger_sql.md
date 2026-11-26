# generate_trigger_sql()

```ts
function generate_trigger_sql(entityMetadata, options): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table/trigger\_sql.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table/trigger_sql.ts#L94)

Generates PostgreSQL trigger SQL

Generates INSERT/UPDATE/DELETE triggers for the entity table, automatically recording all data changes into the RxDBChange table. PostgreSQL triggers require the trigger function to be created first, then the trigger itself.

transactionId preferentially reads the transaction-local setting, which expires automatically when the transaction commits or rolls back. The generation-time transactionId is kept only as a fallback for compatibility with legacy callers.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityMetadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `options` | `TriggerOptions` | Trigger options |

## Returns

`string`

The complete trigger SQL statement

## Example

```typescript
const sql = generate_trigger_sql(todoMetadata, { branchId: 'main' });
await adapter.exec(sql);

// Kept for legacy callers: generation-time transactionId fallback
const sqlWithTx = generate_trigger_sql(todoMetadata, { branchId: 'main', transactionId: 'tx-123' });
await adapter.exec(sqlWithTx);
```
