# placePopover()

```ts
function placePopover(anchor, size, viewport, options?): object;
```

Defined in: [packages/rxdb-plugin-board/src/popover.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/popover.ts#L31)

Top-left corner coordinates of the popover: below the trigger by default; flips above when there is no room below and the top has more space;
horizontally and vertically finally clamped back into the viewport.

## Parameters

| Parameter         | Type                                                |
| ----------------- | --------------------------------------------------- |
| `anchor`          | [`PopoverAnchor`](../interfaces/PopoverAnchor.md)   |
| `size`            | \{ `height`: `number`; `width`: `number`; \}        |
| `size.height`     | `number`                                            |
| `size.width`      | `number`                                            |
| `viewport`        | \{ `height`: `number`; `width`: `number`; \}        |
| `viewport.height` | `number`                                            |
| `viewport.width`  | `number`                                            |
| `options?`        | [`PopoverOptions`](../interfaces/PopoverOptions.md) |

## Returns

`object`

### left

```ts
readonly left: number;
```

### top

```ts
readonly top: number;
```
