# handleTableKeydown()

```ts
function handleTableKeydown(ctx, e): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-keyboard.d.ts:36

Table container keydown event handler — clipboard shortcuts + boolean toggle + delete.
Clipboard shortcuts and the delete key are not intercepted while editing.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ctx` | [`KeyboardHandlerContext`](../interfaces/KeyboardHandlerContext.md) | Keyboard handling context |
| `e` | `KeyboardEvent` | The keyboard event |

## Returns

`void`
