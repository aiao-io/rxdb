# resolveWatermarkContent()

```ts
function resolveWatermarkContent(content, fallback): string;
```

Defined in: [widgets/watermark.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/watermark.ts#L30)

The watermark text: explicit content wins; when blank, the host-provided default text is used.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `content` | `string` | The watermark content in the preferences. |
| `fallback` | `string` | The default text (user name, application name). |

## Returns

`string`

The final text, possibly an empty string.
