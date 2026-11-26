# EntityCheckMetadataOptions

Defined in: [packages/rxdb/src/entity/check-constraint.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L116)

Entity-level CHECK declaration.

## Example

```typescript
@Entity({
  checks: [
    {
      name: 'unit_range',
      rule: `{ combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }`
    }
  ]
})
class Item extends EntityBase {}
```

## Properties

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L118)

The constraint name given by the author, restricted to `[a-z][a-z0-9_]*`; it forms the middle segment of the deterministic constraint name.

---

### rule \{#rule\}

```ts
rule: CheckRuleGroup;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L120)

A single-row rule group.
