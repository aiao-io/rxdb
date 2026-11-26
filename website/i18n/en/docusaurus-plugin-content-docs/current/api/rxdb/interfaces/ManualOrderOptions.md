# ManualOrderOptions

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L31)

Declaration of grouped manual ordering.

## Remarks

Rows with the same group-field values form an independent sequence (an ordering domain); keys in different domains are
unrelated to each other and may repeat. An empty `groupBy` array is equivalent to `manualOrder: true` (one sequence for
the whole table). Group fields must be scalar columns of the entity itself (including many-to-one foreign key columns
such as `categoryId`), non-computed, writable, and unencrypted; NULL is a group of its own and sorts first in the
default ordering.

## Example

```typescript
@Entity({ name: 'Todo', manualOrder: { groupBy: ['completed'] }, properties: [...] })
class Todo extends EntityBase implements ISortableEntity {}
```

## Properties

### groupBy \{#groupby\}

```ts
readonly groupBy: readonly string[];
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L33)

Group fields; they participate in the default ordering in declaration order.
