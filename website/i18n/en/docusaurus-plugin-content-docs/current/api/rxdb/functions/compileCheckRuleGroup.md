# compileCheckRuleGroup()

```ts
function compileCheckRuleGroup(metadata, group, subject): string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:418](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L418)

Compiles a single-row rule group into a parenthesized SQL expression (literals only).

## Parameters

| Parameter  | Type                                                  | Description                                                                                                         |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata produced by `transitionMetadata()`                                                              |
| `group`    | [`CheckRuleGroup`](../interfaces/CheckRuleGroup.md)   | The single-row rule group                                                                                           |
| `subject`  | `string`                                              | The subject of the error message, such as `CHECK qty_xor_formula`, `the where of conditional unique index released` |

## Returns

`string`

The normalized expression: column names double-quote delimited, literals compiled per column type, one statement for both backends

## Throws

[RxDBError](../classes/RxDBError.md) for operators outside the whitelist, relation paths, JSON / key-value / binary / encrypted columns,
literals out of the value domain, malformed rule groups, etc.; the message names the subject and the reason (AC#9 / AC#15)

## Remarks

CHECK and the `where` of conditional unique indexes share this function: both are deterministic single-row predicates,
and the partial indexes of both PG and SQLite accept every comparison in the whitelist.
