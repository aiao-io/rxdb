# watermarkBackground()

```ts
function watermarkBackground(content): string;
```

Defined in: [widgets/watermark.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/watermark.ts#L57)

Generates a CSS `url(...)` usable directly as a `background-image`.

## Parameters

| Parameter | Type     | Description         |
| --------- | -------- | ------------------- |
| `content` | `string` | The watermark text. |

## Returns

`string`

The CSS value; an empty string when the text is empty.
