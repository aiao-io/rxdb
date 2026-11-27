# labelTextColor()

```ts
function labelTextColor(color): '#000000' | '#ffffff';
```

Defined in: [packages/rxdb-plugin-board/src/label-text-color.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-text-color.ts#L34)

Chooses the text color (black or white) based on the label background color.

## Parameters

| Parameter | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `color`   | `string` | The label color, `#rgb` or `#rrggbb` |

## Returns

`"#000000"` \| `"#ffffff"`

`#000000` (black text on a light background) or `#ffffff` (white text on a dark background)

## Throws

When the color format is invalid (`invalid_color`)
