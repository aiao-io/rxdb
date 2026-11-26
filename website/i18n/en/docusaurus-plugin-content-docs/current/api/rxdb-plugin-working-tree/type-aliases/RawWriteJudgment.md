# RawWriteJudgment

```ts
type RawWriteJudgment = 
  | {
  kind: "allow";
  reason: RawWriteAllowReason;
  step: 1 | 2 | 4;
}
  | {
  code: typeof commit_capability_mismatch;
  kind: "reject";
  step: 3;
  tables: readonly string[];
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L73)

Which step the judgment landed on; step 3 is the only step that rejects.

## Union Members

### Type Literal

```ts
{
  kind: "allow";
  reason: RawWriteAllowReason;
  step: 1 | 2 | 4;
}
```

#### kind

```ts
readonly kind: "allow";
```

Allowed: the statement executes as usual

#### reason

```ts
readonly reason: RawWriteAllowReason;
```

Why it is allowed

#### step

```ts
readonly step: 1 | 2 | 4;
```

Which step it landed on

***

### Type Literal

```ts
{
  code: typeof commit_capability_mismatch;
  kind: "reject";
  step: 3;
  tables: readonly string[];
}
```

#### code

```ts
readonly code: typeof commit_capability_mismatch;
```

epic-006's stable error code

#### kind

```ts
readonly kind: "reject";
```

Rejected: the statement is **not dispatched at all**

#### step

```ts
readonly step: 3;
```

Always 3

#### tables

```ts
readonly tables: readonly string[];
```

The versioned tables that were hit; an empty array when no target table can be resolved
