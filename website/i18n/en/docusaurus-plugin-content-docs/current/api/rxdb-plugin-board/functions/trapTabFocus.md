# trapTabFocus()

```ts
function trapTabFocus<T>(focusables, active, backwards): T | null;
```

Defined in: [packages/rxdb-plugin-board/src/focus-trap.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/focus-trap.ts#L28)

Tab focus cycle target.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter    | Type           | Description                                           |
| ------------ | -------------- | ----------------------------------------------------- |
| `focusables` | readonly `T`[] | Focusable elements inside the dialog (document order) |
| `active`     | `T` \| `null`  | Current focus                                         |
| `backwards`  | `boolean`      | Whether it is `Shift + Tab`                           |

## Returns

`T` \| `null`

The element to focus when taking over: wraps around at the ends and pulls the focus back into the dialog when it is outside the sequence;
`null` when the focus is in the middle (delegated to the browser default order) or the dialog has no focusable elements
