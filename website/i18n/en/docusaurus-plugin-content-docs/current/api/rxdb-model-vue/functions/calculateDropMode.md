# calculateDropMode()

```ts
function calculateDropMode(
   clientY, 
   rect, 
   isGroup
): QueryDropMode;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L83)

Computes the drop mode from the position of clientY in the target rectangle (group mode includes an into range)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `clientY` | `number` |
| `rect` | `DOMRect` |
| `isGroup` | `boolean` |

## Returns

[`QueryDropMode`](../type-aliases/QueryDropMode.md)
