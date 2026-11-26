# lucideToSvgElement()

```ts
function lucideToSvgElement(icon, color, size?): SVGSVGElement;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/lucide-svg.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/lucide-svg.ts#L55)

Converts `LucideIconData` into an inline SVG element (built via the DOM API, immune to markup injection).

## Parameters

| Parameter | Type                                      | Default value | Description                                                |
| --------- | ----------------------------------------- | ------------- | ---------------------------------------------------------- |
| `icon`    | [`IconData`](../type-aliases/IconData.md) | `undefined`   | The lucide icon data                                       |
| `color`   | `string`                                  | `undefined`   | The stroke color (falls back to currentColor when invalid) |
| `size?`   | `number`                                  | `13`          | Width/height in pixels, default 13                         |

## Returns

`SVGSVGElement`

The inline SVG element
