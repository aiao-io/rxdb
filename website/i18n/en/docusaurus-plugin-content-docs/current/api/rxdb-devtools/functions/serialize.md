# serialize()

```ts
function serialize(event, sequence): SerializedEvent;
```

Defined in: [serializer.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/serializer.ts#L222)

Serializes an RxDB event.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `object` & `Record`&lt;`string`, `unknown`&gt; |
| `sequence` | `number` |

## Returns

[`SerializedEvent`](../interfaces/SerializedEvent.md)
