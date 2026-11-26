# breaksReadOnly()

```ts
function breaksReadOnly(sql): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:799](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L799)

Whether this batch of statements should be rejected on a read-only connection: statements that change data, plus `PRAGMA` / `SET` / `set_config()` that change session state.

## Parameters

| Parameter | Type     | Description                                                       |
| --------- | -------- | ----------------------------------------------------------------- |
| `sql`     | `string` | The raw statement, possibly a semicolon-separated statement batch |

## Returns

`boolean`

`true` when any one statement should be rejected; "changes data" uses the same criterion as step 2 of [judgeRawWrite](judgeRawWrite.md)

## Remarks

The read-only checkout's read-only hook uses it to block raw calls (US-313): there is no versioned domain to ask there, any write is rejected; session settings are rejected too, because the engine seal itself is session state, and one `PRAGMA query_only = 0` would undo it.
