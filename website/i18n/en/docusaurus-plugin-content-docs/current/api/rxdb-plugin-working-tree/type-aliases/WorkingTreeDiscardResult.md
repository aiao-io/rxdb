# WorkingTreeDiscardResult

```ts
type WorkingTreeDiscardResult = 
  | {
  discardedCount: number;
  ok: true;
  workingTreeRevision: number;
}
  | {
  conflict: CommitConflict;
  ok: false;
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/discard-command.ts#L58)

The result of one `discard()` call.

## Union Members

### Type Literal

```ts
{
  discardedCount: number;
  ok: true;
  workingTreeRevision: number;
}
```

#### discardedCount

```ts
readonly discardedCount: number;
```

Number of units discarded this time; `0` is a semantic no-op

#### ok

```ts
readonly ok: true;
```

The working tree is back at HEAD

#### workingTreeRevision

```ts
readonly workingTreeRevision: number;
```

The working tree revision after discarding; on a no-op it is the original value

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

Diagnostic value; **not persisted**

#### ok

```ts
readonly ok: false;
```

One of the three captured positions does not match, and not one byte of this discard landed

## Remarks

The success exit has **no `noop` boolean**: `discardedCount === 0` is the no-op; one more bit is a second
truth, and of two truths one will eventually be stale.
