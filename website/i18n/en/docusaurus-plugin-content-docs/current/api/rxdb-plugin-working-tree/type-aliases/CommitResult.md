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

The result of one `commit()` call.

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

Number of change units in this commit

#### commitId

```ts
readonly commitId: string;
```

Id of the new commit

#### headRevision

```ts
readonly headRevision: number;
```

The HEAD revision after advancing

#### ok

```ts
readonly ok: true;
```

This commit has landed in the database

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

Diagnostic value; **not persisted**, and there is no "clear conflict" API

#### ok

```ts
readonly ok: false;
```

One of the three captured positions does not match, and not one byte of this commit landed

## Remarks

The discriminator is `ok`, not "is `conflict` present": the latter forces callers to use `'conflict' in result`
or optional-property emptiness checks, and optional properties silently collapse to "always succeeds" on consumers with `strictNullChecks` off.
