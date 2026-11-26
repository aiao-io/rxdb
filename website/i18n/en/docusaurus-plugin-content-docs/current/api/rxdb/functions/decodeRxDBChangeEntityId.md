# decodeRxDBChangeEntityId()

```ts
function decodeRxDBChangeEntityId(value): RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:383](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L383)

Deserialization of [encodeRxDBChangeEntityId](encodeRxDBChangeEntityId.md). A value without the prefix is treated as "never encoded" and
returned as-is (compatible with old RxDB data).

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `unknown` |

## Returns

[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)
