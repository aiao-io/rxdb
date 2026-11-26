# deriveLayout()

```ts
function deriveLayout(input): LayoutState;
```

Defined in: [layout/layout-state.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/layout-state.ts#L77)

Derives the layout from preferences, viewport and menu.

## Parameters

| Parameter | Type                                          | Description                                      |
| --------- | --------------------------------------------- | ------------------------------------------------ |
| `input`   | [`LayoutInput`](../interfaces/LayoutInput.md) | Preferences, viewport, maximized and menu state. |

## Returns

[`LayoutState`](../interfaces/LayoutState.md)

The layout.

## Remarks

When the sidebar is turned off (`sidebar.enable = false`), navigation automatically falls back to the horizontal menu in the header so the user never loses the navigation entry point.
