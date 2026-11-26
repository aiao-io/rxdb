# encodeRxDBChangeEntityId()

```ts
function encodeRxDBChangeEntityId(id): string;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L350)

Wraps an `RxDBEntityId` into a string carrying a version number. **All** ids get the envelope — string /
number / bigint all carry the prefix, the version number and a type tag, and the tag distinguishes them at deserialization time.

("Strings go through the raw channel" is the behavior of [getRxDBChangeEntityIdQueryValues](getRxDBChangeEntityIdQueryValues.md), not of this function.)

The [RXDB\_CHANGE\_ENTITY\_ID\_PREFIX](../variables/RXDB_CHANGE_ENTITY_ID_PREFIX.md) prefix is added to **prevent collisions**:
`1` and `'1'` merge into the same JSON key in some NoSQL stores;
with the prefix, both are encoded independently.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `id`      | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) |

## Returns

`string`
