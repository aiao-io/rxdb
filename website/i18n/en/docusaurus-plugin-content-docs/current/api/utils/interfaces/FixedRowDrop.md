---
sidebar_label: 'FixedRowDrop⟨Id⟩'
---

# FixedRowDrop`<Id>`

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L15)

The drop position at release: the dragged row's id, the id sequence at drag start, and the start / end indexes.

It is only called when the id sequence at release is still item-by-item identical to that at drag start, so `ids[fromIndex] === id` always holds and the indexes can be used directly against `ids` to compute neighbors; whether it constitutes a move (start equals end) is up to the caller.

## Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-id"></a> `Id` |

## Properties

### fromIndex \{#fromindex\}

```ts
fromIndex: number;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L21)

The index of the dragged row

---

### id \{#id\}

```ts
id: Id;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L17)

The id of the dragged row

---

### ids \{#ids\}

```ts
ids: readonly Id[];
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L19)

The id sequence at drag start (which equals the one at release)

---

### toIndex \{#toindex\}

```ts
toIndex: number;
```

Defined in: [packages/utils/src/@browser/fixed-row-drag.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/fixed-row-drag.ts#L23)

The drop index, clamped to `[0, ids.length - 1]`
