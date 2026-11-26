# toggleWidgetHidden()

```ts
function toggleWidgetHidden(hidden, key): WidgetKey[];
```

Defined in: [widgets/widget-order.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/widget-order.ts#L36)

Toggles widget visibility; the settings entry cannot be hidden.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `hidden` | readonly [`WidgetKey`](../type-aliases/WidgetKey.md)[] | The current hidden set. |
| `key` | [`WidgetKey`](../type-aliases/WidgetKey.md) | The widget key. |

## Returns

[`WidgetKey`](../type-aliases/WidgetKey.md)[]

The new hidden set.
