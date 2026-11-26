# ExclusionRangeConflict

Defined in: [packages/rxdb/src/RxDBError.ts:333](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L333)

The two sides' values of one dimension's range in an exclusion conflict (see [RxDBExclusionViolationError](../classes/RxDBExclusionViolationError.md)).

## Properties

### bounds \{#bounds\}

```ts
readonly bounds: "[)" | "[]";
```

Defined in: [packages/rxdb/src/RxDBError.ts:339](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L339)

Range bounds: `[)` left-closed right-open, `[]` closed at both ends

---

### existing \{#existing\}

```ts
readonly existing: readonly [unknown, unknown];
```

Defined in: [packages/rxdb/src/RxDBError.ts:343](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L343)

The existing conflicting row's `[start, end]` in this dimension; `null` means that side is unbounded

---

### from \{#from\}

```ts
readonly from: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L335)

The range start column (property name)

---

### incoming \{#incoming\}

```ts
readonly incoming: readonly [unknown, unknown];
```

Defined in: [packages/rxdb/src/RxDBError.ts:341](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L341)

This write's row `[start, end]` in this dimension; `null` means that side is unbounded

---

### to \{#to\}

```ts
readonly to: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:337](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L337)

The range end column (property name)
