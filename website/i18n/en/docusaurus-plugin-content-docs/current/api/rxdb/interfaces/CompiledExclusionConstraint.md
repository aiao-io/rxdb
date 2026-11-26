# CompiledExclusionConstraint

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L100)

A compiled range exclusion: shared by the DDL of both backends, drift comparison and violation normalization.

## Properties

### equal \{#equal\}

```ts
equal: readonly CompiledExclusionColumn[];
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L104)

Equality columns.

---

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L102)

Deterministic constraint name (starts with `ex_`, includes the definition hash).

---

### ranges \{#ranges\}

```ts
ranges: readonly CompiledExclusionRange[];
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L106)

Range dimensions.
