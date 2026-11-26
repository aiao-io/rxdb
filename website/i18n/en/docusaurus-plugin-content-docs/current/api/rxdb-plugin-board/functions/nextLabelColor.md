# nextLabelColor()

```ts
function nextLabelColor(usedColors): string;
```

Defined in: [packages/rxdb-plugin-board/src/palette.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/palette.ts#L25)

Default color for a new label: the first preset color not used by the current board; cycles from the start after all are used.
Compares in lowercase and does not expand the `#rgb` short format: none of the 8 preset colors has a 3-digit form, so custom short-format colors cannot collide with presets;
two forms of the same color only count one extra "used" after all presets are used, shifting the cycle start.

## Parameters

| Parameter    | Type                |
| ------------ | ------------------- |
| `usedColors` | readonly `string`[] |

## Returns

`string`
