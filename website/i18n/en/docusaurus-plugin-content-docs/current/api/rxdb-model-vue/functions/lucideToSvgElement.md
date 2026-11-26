# lucideToSvgElement()

```ts
function lucideToSvgElement(icon, color, size?): SVGSVGElement;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/lucide-svg.d.ts:11

Converts `LucideIconData` into an inline SVG element (built via DOM API, immune to markup injection)

## Parameters

| Parameter | Type                                      | Description                                            |
| --------- | ----------------------------------------- | ------------------------------------------------------ |
| `icon`    | [`IconData`](../type-aliases/IconData.md) | Lucide icon data                                       |
| `color`   | `string`                                  | Stroke color (falls back to currentColor when invalid) |
| `size?`   | `number`                                  | Width and height in pixels, default 13                 |

## Returns

`SVGSVGElement`

The inline SVG element
