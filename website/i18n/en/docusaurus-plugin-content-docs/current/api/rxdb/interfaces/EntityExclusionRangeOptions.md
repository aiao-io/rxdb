# EntityExclusionRangeOptions

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L37)

One range dimension of a range exclusion: the start and end columns and the bounds.

## Properties

### bounds \{#bounds\}

```ts
bounds: '[)' | '[]';
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L43)

Range bounds.

---

### from \{#from\}

```ts
from: string;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L39)

The range start column (a property name); a NULL value means that side is unbounded.

---

### to \{#to\}

```ts
to: string;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L41)

The range end column (a property name); a NULL value means that side is unbounded.
