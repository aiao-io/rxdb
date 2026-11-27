# EntityExclusionMetadataOptions

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L64)

Entity-level exclusion range declaration.

## Example

```typescript
@Entity({
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['bomLineId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
        `{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }`
      ]
    }
  ]
})
class BomLineOccurrence extends EntityBase {}
```

## Properties

### equal \{#equal\}

```ts
equal: readonly string[];
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L68)

Equality columns (property names or relation foreign key names), at least one; rows with any column NULL do not take part in conflicts (consistent across both backends).

---

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L66)

The constraint name given by the author, restricted to `[a-z][a-z0-9_]*`; it forms the middle segment of the deterministic constraint name.

---

### ranges \{#ranges\}

```ts
ranges: readonly EntityExclusionRangeOptions[];
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L70)

Range dimensions, at least one; all dimensions must intersect simultaneously for a conflict.
