---
sidebar_label: "ReorderTarget⟨Id⟩"
---

# ReorderTarget`<Id>`

```ts
type ReorderTarget<Id> = 
  | ReorderBetween<Id>
  | ReorderToGroupEnd;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L101)

Reorder target position

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-id"></a> `Id` | The entity primary key type |
