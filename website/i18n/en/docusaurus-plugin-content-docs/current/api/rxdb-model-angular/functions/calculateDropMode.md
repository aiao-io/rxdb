# calculateDropMode()

```ts
function calculateDropMode(clientY, rect, isGroup): QueryDropMode;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L70)

Calculates the drop mode from clientY and the target rectangle (group mode supports into).

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `clientY` | `number`  |
| `rect`    | `DOMRect` |
| `isGroup` | `boolean` |

## Returns

[`QueryDropMode`](../type-aliases/QueryDropMode.md)
