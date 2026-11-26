# CompiledExclusionRange

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L88)

A compiled one-dimensional range.

## Properties

### bounds \{#bounds\}

```ts
bounds: '[)' | '[]';
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L94)

Bounds.

---

### from \{#from\}

```ts
from: CompiledExclusionColumn;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L90)

Start column.

---

### kind \{#kind\}

```ts
kind: ExclusionRangeKind;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L96)

Value domain.

---

### to \{#to\}

```ts
to: CompiledExclusionColumn;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L92)

End column.
