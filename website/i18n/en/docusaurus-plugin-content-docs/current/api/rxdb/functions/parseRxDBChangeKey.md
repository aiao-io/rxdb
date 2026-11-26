# parseRxDBChangeKey()

```ts
function parseRxDBChangeKey(entityKey): readonly [string, string, RxDBEntityId];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.utils.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.utils.ts#L17)

Parses an entity key.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityKey` | `string` | The entity key string |

## Returns

readonly \[`string`, `string`, [`RxDBEntityId`](../type-aliases/RxDBEntityId.md)\]

[namespace, entity, entityId]
