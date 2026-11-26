# handleTableKeydown()

```ts
function handleTableKeydown(ctx, e): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-keyboard.ts#L50)

Table container keydown event handler — clipboard shortcuts + boolean toggling + deletion.
While editing, clipboard shortcuts and the delete key are not intercepted.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ctx` | [`KeyboardHandlerContext`](../interfaces/KeyboardHandlerContext.md) | The keyboard handling context |
| `e` | `KeyboardEvent` | The keyboard event |

## Returns

`void`
