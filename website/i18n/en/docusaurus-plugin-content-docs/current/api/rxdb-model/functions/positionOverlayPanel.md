# positionOverlayPanel()

```ts
function positionOverlayPanel(panel, rect, container, estimatedHeight, options?): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L48)

Positions the floating panel below the cell (flips above when space is insufficient).

## Parameters

| Parameter           | Type                                                                              | Description                                                                                           |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `panel`             | `HTMLElement`                                                                     | The floating panel element                                                                            |
| `rect`              | \{ `height?`: `number`; `left`: `number`; `top`: `number`; `width?`: `number`; \} | The cell's position rectangle relative to the VTable container                                        |
| `rect.height?`      | `number`                                                                          | -                                                                                                     |
| `rect.left`         | `number`                                                                          | -                                                                                                     |
| `rect.top`          | `number`                                                                          | -                                                                                                     |
| `rect.width?`       | `number`                                                                          | -                                                                                                     |
| `container`         | `HTMLElement` \| `null` \| `undefined`                                            | The VTable container (used to convert to absolute page coordinates)                                   |
| `estimatedHeight`   | `number`                                                                          | The panel's estimated height (used to decide whether to flip above)                                   |
| `options?`          | \{ `maxRight?`: `number`; `minWidth?`: `number`; \}                               | Optional layout options (maxRight the panel's maximum right edge, minWidth the panel's minimum width) |
| `options.maxRight?` | `number`                                                                          | -                                                                                                     |
| `options.minWidth?` | `number`                                                                          | -                                                                                                     |

## Returns

`void`
