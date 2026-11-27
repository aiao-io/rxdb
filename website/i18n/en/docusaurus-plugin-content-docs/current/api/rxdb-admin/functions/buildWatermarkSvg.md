# buildWatermarkSvg()

```ts
function buildWatermarkSvg(content, options?): string;
```

Defined in: [widgets/watermark.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/watermark.ts#L41)

Generates the SVG of one tiling unit (with embedded rotated text). A pure function that does not touch the DOM; the text is XML-escaped.

## Parameters

| Parameter  | Type                                                    | Default value               | Description          |
| ---------- | ------------------------------------------------------- | --------------------------- | -------------------- |
| `content`  | `string`                                                | `undefined`                 | The watermark text.  |
| `options?` | [`WatermarkOptions`](../interfaces/WatermarkOptions.md) | `DEFAULT_WATERMARK_OPTIONS` | The unit parameters. |

## Returns

`string`

The SVG text.
