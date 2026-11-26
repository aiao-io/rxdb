# positionOverlayPanel()

```ts
function positionOverlayPanel(panel, rect, container, estimatedHeight, options?): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:37

Positions the overlay panel below the cell (flips above when there is not enough space)

## Parameters

| Parameter           | Type                                                                              | Description                                                                                           |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `panel`             | `HTMLElement`                                                                     | The overlay panel element                                                                             |
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
