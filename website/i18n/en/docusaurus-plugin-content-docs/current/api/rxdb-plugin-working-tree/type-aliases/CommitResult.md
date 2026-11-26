# CommitResult

```ts
type CommitResult = 
  | {
  changeSetCount: number;
  commitId: string;
  headRevision: number;
  ok: true;
}
  | {
  conflict: CommitConflict;
  ok: false;
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L74)

The result of a `commit()` call.

## Union Members

### Type Literal

```ts
{
  changeSetCount: number;
  commitId: string;
  headRevision: number;
  ok: true;
}
```

#### changeSetCount

```ts
readonly changeSetCount: number;
```

The number of change units in this commit

#### commitId

```ts
readonly commitId: string;
```

The new commit's id

#### headRevision

```ts
readonly headRevision: number;
```

The HEAD revision after the advance

#### ok

```ts
readonly ok: true;
```

This commit has been persisted

***

### Type Literal

```ts
{
  conflict: CommitConflict;
  ok: false;
}
```

#### conflict

```ts
readonly conflict: CommitConflict;
```

The diagnostic value; **not persisted**, and there is no "clear the conflict" API

#### ok

```ts
readonly ok: false;
```

One of the three captured slots does not match, and not a single byte of this commit was persisted

## Remarks

The discriminator is `ok` rather than "is `conflict` present": the latter forces callers to check with
`'conflict' in result` or an optional property, and optional properties silently collapse into "always
succeeds" on consumers with `strictNullChecks` turned off.
