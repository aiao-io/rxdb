# focusModalTab()

```ts
function focusModalTab(root, backwards): boolean;
```

Defined in: [packages/rxdb-plugin-board/src/focus-trap.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/focus-trap.ts#L44)

Confines Tab within the modal; an empty modal focuses the container, middle positions keep the browser order.

## Parameters

| Parameter   | Type          | Description                           |
| ----------- | ------------- | ------------------------------------- |
| `root`      | `HTMLElement` | The root element of the current board |
| `backwards` | `boolean`     | Whether Shift + Tab was pressed       |

## Returns

`boolean`

true when the focus has been taken over
