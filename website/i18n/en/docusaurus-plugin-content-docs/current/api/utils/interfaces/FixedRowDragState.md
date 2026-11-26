# FixedRowDragState

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L2)

The drop state during a drag: started from row `fromIndex`, currently hovering over row `overIndex`.

## Properties

### fromIndex \{#fromindex\}

```ts
fromIndex: number;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L4)

The dragged row's index in the list

***

### overIndex \{#overindex\}

```ts
overIndex: number;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L6)

The drop index currently under the pointer, clamped to `[0, rowCount - 1]`
