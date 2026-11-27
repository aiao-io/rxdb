---
sidebar_label: 'FixedRowDragOptions⟨Id⟩'
---

# FixedRowDragOptions`<Id>`

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L27)

Constructor parameters of [FixedRowDrag](../classes/FixedRowDrag.md).

## Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-id"></a> `Id` |

## Properties

### ids \{#ids\}

```ts
ids: () => readonly Id[];
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L38)

The list's current id sequence (matching render order). A snapshot is taken when the drag starts; it is re-checked every frame, on every pointer move, and on release during the drag — if it differs from the snapshot (insert, delete, group change, reorder), the session is cancelled and `onDrop` is not called

#### Returns

readonly `Id`[]

---

### listElement \{#listelement\}

```ts
listElement: () => HTMLElement;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L33)

The list body (the container holding the total height of all rows); the drop position is computed from the pointer's offset relative to its top edge

#### Returns

`HTMLElement`

---

### onChange \{#onchange\}

```ts
onChange: (state) => void;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L40)

Called when the drop position changes; called with `null` when the drag ends (release or cancel)

#### Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `state`   | [`FixedRowDragState`](FixedRowDragState.md) \| `null` |

#### Returns

`void`

---

### onDrop \{#ondrop\}

```ts
onDrop: (drop) => void;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L42)

Called with the drop position on release when the list has not changed

#### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `drop`    | [`FixedRowDrop`](FixedRowDrop.md)&lt;`Id`&gt; |

#### Returns

`void`

---

### rowHeight \{#rowheight\}

```ts
rowHeight: number;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L29)

Row height (px); must be a positive finite number; the itemSize of a virtual list

---

### scrollElement \{#scrollelement\}

```ts
scrollElement: () => HTMLElement;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L31)

The scroll container; the list auto-scrolls near its top and bottom edges. Passed as a function because element references in frameworks are often created later than the controller

#### Returns

`HTMLElement`
