# resolveThemeName()

```ts
function resolveThemeName(name, systemDark, themes): string;
```

Defined in: [theme/themes.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/themes.ts#L83)

Resolves the theme preference into a concrete theme name.

## Parameters

| Parameter    | Type                                                     | Description                                                     |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| `name`       | `string`                                                 | The theme name in the preferences; `system` follows the system. |
| `systemDark` | `boolean`                                                | Whether the system is currently dark.                           |
| `themes`     | readonly [`ThemeOption`](../interfaces/ThemeOption.md)[] | The available themes.                                           |

## Returns

`string`

The theme name to write to `data-theme`.
