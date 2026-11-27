# computeRxDBSchemaFingerprint()

```ts
function computeRxDBSchemaFingerprint(entities): string;
```

Defined in: [packages/rxdb/src/backup/schema-fingerprint.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/schema-fingerprint.ts#L42)

Computes the entity structure fingerprint.

## Parameters

| Parameter  | Type                                                     | Description                                          |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `entities` | readonly [`EntityType`](../type-aliases/EntityType.md)[] | The entity classes (system entities may be mixed in) |

## Returns

`string`

A 64-digit hexadecimal SHA-256.

## Remarks

System entities do not take part: the system table structure is gated separately by `RXDB_SYSTEM_SCHEMA_VERSION`. Independent of entity declaration order; changes to field constraints, literal defaults, relations, indexes, foreign keys, or feature switches alter the fingerprint, while display text and function defaults do not.

## Example

```typescript
const fingerprint = computeRxDBSchemaFingerprint([Todo, Tag]);
```
