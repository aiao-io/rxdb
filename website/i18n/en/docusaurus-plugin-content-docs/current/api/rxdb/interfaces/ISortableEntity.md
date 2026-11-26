# ISortableEntity

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L60)

The shape of a manually sortable entity

## Remarks

Only a TS convenience type (erased after compilation), not a runtime declaration — at runtime `@Entity({ manualOrder })` is what counts.

## Example

```typescript
@Entity({ name: 'Category', manualOrder: true, properties: [{ name: 'sortOrder', type: PropertyType.string }] })
class Category extends EntityBase implements ISortableEntity {
  sortOrder!: SortOrderKey;
}
```

## Properties

### sortOrder \{#sortorder\}

```ts
sortOrder: string;
```

Defined in: [packages/rxdb/src/sortable/sortable.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sortable/sortable.interface.ts#L62)

The ordering key, non-empty
