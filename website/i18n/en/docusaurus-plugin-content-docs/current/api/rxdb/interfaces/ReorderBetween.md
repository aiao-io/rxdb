---
sidebar_label: 'ReorderBetween⟨Id⟩'
---

# ReorderBetween`<Id>`

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L74)

Reorder target: move between two neighbors

## Remarks

When moving to the head of the sequence, `prevId` is `null`; when moving to the tail, `nextId` is `null`. Both sides being `null` is invalid;
to move to the end use [ReorderToGroupEnd](ReorderToGroupEnd.md).

## Type Parameters

| Type Parameter                      | Description                 |
| ----------------------------------- | --------------------------- |
| <a id="type-parameter-id"></a> `Id` | The entity primary key type |

## Properties

### expectedGroup? \{#expectedgroup\}

```ts
expectedGroup?: Readonly<Record<string, unknown>>;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L80)

Optional expected target group; the key set matches the grouping fields, and if the neighbors are found to have changed groups within the transaction, `staleTarget` is reported.

---

### nextId \{#nextid\}

```ts
nextId: Id | null;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L78)

The row after the target position; `null` when moving to the tail

---

### prevId \{#previd\}

```ts
prevId: Id | null;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L76)

The row before the target position; `null` when moving to the head
