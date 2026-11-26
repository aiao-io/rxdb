# ReorderToGroupEnd

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L91)

Reorder target: append to the end of an ordering domain

## Remarks

`group` gives the grouping-field values of the target ordering domain; the key set must exactly equal the declared grouping fields:
whole-table ordering is `{}`, `groupBy: ['categoryId']` is `{ categoryId }` (write `null` for the NULL group).
When the target group differs from the row's current group, this is a cross-group move that rewrites both the grouping fields and `sortOrder`.

## Properties

### group \{#group\}

```ts
group: Readonly<Record<string, unknown>>;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L93)

The grouping-field values of the target ordering domain; `{}` for whole-table ordering
