# ParsedExclusionViolation

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L33)

A recognized range exclusion violation: the constraint name, plus the original text of the conflicting keys that could be obtained.

## Properties

### constraintName \{#constraintname\}

```ts
readonly constraintName: string;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L35)

The constraint name (only one starting with `ex_` can be metadata-declared)

***

### detail? \{#detail\}

```ts
readonly detail?: string;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L37)

PG's raw `DETAIL` text (`Key (…)=(…) conflicts with existing key (…)=(…).`)

***

### payload? \{#payload\}

```ts
readonly payload?: string;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L39)

The JSON payload in the SQLite trigger message (per dimension `[this row start, this row end, existing row start, existing row end]`)
