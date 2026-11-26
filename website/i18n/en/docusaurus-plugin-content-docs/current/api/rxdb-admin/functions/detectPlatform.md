# detectPlatform()

```ts
function detectPlatform(source): ShortcutPlatform;
```

Defined in: [shortcuts/combo.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/combo.ts#L164)

Determines the running platform.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`PlatformSource`](../interfaces/PlatformSource.md) \| `undefined` | `navigator`; when absent (SSR / tests) it is treated as `other`. |

## Returns

[`ShortcutPlatform`](../type-aliases/ShortcutPlatform.md)

`mac` (including iOS) or `other`.
