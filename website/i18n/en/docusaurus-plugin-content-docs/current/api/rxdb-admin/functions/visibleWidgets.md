# visibleWidgets()

```ts
function visibleWidgets(widget): WidgetKey[];
```

Defined in: [widgets/widget-order.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/widget-order.ts#L9)

The widgets visible on the top bar, in the order arranged by the user.

## Parameters

| Parameter       | Type                                                                                                                   | Description                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `widget`        | \{ `hidden`: [`WidgetKey`](../type-aliases/WidgetKey.md)[]; `order`: [`WidgetKey`](../type-aliases/WidgetKey.md)[]; \} | The widget configuration in the preferences.                                         |
| `widget.hidden` | [`WidgetKey`](../type-aliases/WidgetKey.md)[]                                                                          | The hidden widgets; `preferences` cannot be hidden.                                  |
| `widget.order`  | [`WidgetKey`](../type-aliases/WidgetKey.md)[]                                                                          | The widget order, always a permutation of [WidgetKey](../type-aliases/WidgetKey.md). |

## Returns

[`WidgetKey`](../type-aliases/WidgetKey.md)[]

The visible widgets.
