# createBootstrapScript()

```ts
function createBootstrapScript(options): string;
```

Defined in: [bootstrap.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/bootstrap.ts#L17)

Generates the inline script placed in `<head>`: before the JS bundle loads it writes the saved theme, primary color, border radius, font size, and grayscale / low-color mode onto `<html>`, avoiding first-paint flicker. The logic matches what the shell's `attach()` writes (guarded by a parity test).

## Parameters

| Parameter | Type                                                                | Description                                                    |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `options` | [`BootstrapScriptOptions`](../interfaces/BootstrapScriptOptions.md) | The storage keys and the theme name corresponding to `system`. |

## Returns

`string`

JS text that can be placed directly inside a `<script>` tag.
