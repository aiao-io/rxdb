# moveVisibleWidget()

```ts
function moveVisibleWidget(
   widget, 
   from, 
   to
): WidgetKey[];
```

Defined in: [widgets/widget-order.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/widget-order.ts#L20)

Reorders within the visible widget list: only visible items move; hidden items keep their relative order and stay at the tail.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `widget` | \{ `hidden`: [`WidgetKey`](../type-aliases/WidgetKey.md)[]; `order`: [`WidgetKey`](../type-aliases/WidgetKey.md)[]; \} | The widget configuration in the preferences. |
| `widget.hidden` | [`WidgetKey`](../type-aliases/WidgetKey.md)[] | The hidden widgets; `preferences` cannot be hidden. |
| `widget.order` | [`WidgetKey`](../type-aliases/WidgetKey.md)[] | The widget order, always a permutation of [WidgetKey](../type-aliases/WidgetKey.md). |
| `from` | `number` | The source index within the visible list. |
| `to` | `number` | The target index within the visible list. |

## Returns

[`WidgetKey`](../type-aliases/WidgetKey.md)[]

The new complete order; when an index is out of bounds or unchanged, a copy of the original order is returned.
