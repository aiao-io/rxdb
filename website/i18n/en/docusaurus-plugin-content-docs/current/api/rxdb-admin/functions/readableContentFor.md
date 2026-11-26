# readableContentFor()

```ts
function readableContentFor(hex, fallback?): "#ffffff" | "#000000";
```

Defined in: [theme/style.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/style.ts#L26)

Picks the foreground color with the higher contrast for a background color, per WCAG relative luminance.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `hex` | `string` | `undefined` | The `#rrggbb` background color. |
| `fallback?` | `"#ffffff"` \| `"#000000"` | `'#ffffff'` | The foreground color used when parsing fails. |

## Returns

`"#ffffff"` \| `"#000000"`

`#ffffff` or `#000000`.
