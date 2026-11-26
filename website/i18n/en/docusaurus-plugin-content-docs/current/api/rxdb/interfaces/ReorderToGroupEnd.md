# ReorderToGroupEnd

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L91)

Reorder target: append to the end of an ordering domain.

## Remarks

`group` gives the target ordering domain's group-field values, and its key set must exactly equal the declared
group fields: `{}` for whole-table ordering, `{ categoryId }` for `groupBy: ['categoryId']` (write `null` for
the NULL group). When the target group differs from the row's current group it is a cross-group move, rewriting
both the group fields and `sortOrder`.

## Properties

### group \{#group\}

```ts
group: Readonly<Record<string, unknown>>;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L93)

The target ordering domain's group-field values; `{}` for whole-table ordering.
