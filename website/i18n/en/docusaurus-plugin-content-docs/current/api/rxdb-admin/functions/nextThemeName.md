# nextThemeName()

```ts
function nextThemeName(current, themes): string;
```

Defined in: [theme/themes.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/theme/themes.ts#L94)

The next state of the top-bar theme button: system → light → dark → system.

## Parameters

| Parameter | Type                                                     | Description                   |
| --------- | -------------------------------------------------------- | ----------------------------- |
| `current` | `string`                                                 | The current theme preference. |
| `themes`  | readonly [`ThemeOption`](../interfaces/ThemeOption.md)[] | The available themes.         |

## Returns

`string`

The next theme preference; themes outside the cycle fall back to light.
