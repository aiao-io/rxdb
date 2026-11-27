# handleTableKeydown()

```ts
function handleTableKeydown(ctx, e): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:36

Table container keydown event handling — clipboard shortcuts + boolean toggling + delete.
While editing, clipboard shortcuts and the delete key are not intercepted.

## Parameters

| Parameter | Type                                                                | Description              |
| --------- | ------------------------------------------------------------------- | ------------------------ |
| `ctx`     | [`KeyboardHandlerContext`](../interfaces/KeyboardHandlerContext.md) | Keyboard handler context |
| `e`       | `KeyboardEvent`                                                     | The keyboard event       |

## Returns

`void`
