# WorkingTreeRestoreResult

```ts
type WorkingTreeRestoreResult = 
  | {
  ok: true;
  restoredCount: number;
  sessionId: string | null;
  workingTreeRevision: number;
}
  | {
  conflict: CommitConflict;
  ok: false;
  reason: "conflict";
}
  | {
  ok: false;
  reason: "dirty_working_tree";
}
  | {
  incompatible: RestoreIncompatibility;
  ok: false;
  reason: "incompatible_schema";
}
  | {
  ok: false;
  reason: "unreachable_target";
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L102)

The result of one `restore()` call.

## Union Members

### Type Literal

```ts
{
  ok: true;
  restoredCount: number;
  sessionId: string | null;
  workingTreeRevision: number;
}
```

#### ok

```ts
readonly ok: true;
```

This restore has landed in the database; with `restoredCount: 0` it is a no-op that wrote nothing

#### restoredCount

```ts
readonly restoredCount: number;
```

Number of entries written into the working tree

#### sessionId

```ts
readonly sessionId: string | null;
```

Id of the restore session created by this call; `null` on a no-op (no session created)

#### workingTreeRevision

```ts
readonly workingTreeRevision: number;
```

The working tree revision after this call; on a no-op it equals the value before the call

***

### Type Literal

```ts
{
  conflict: CommitConflict;
  ok: false;
  reason: "conflict";
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

The three captured positions do not match, or the CAS missed; not one byte landed

#### reason

```ts
readonly reason: "conflict";
```

Discriminator

***

### Type Literal

```ts
{
  ok: false;
  reason: "dirty_working_tree";
}
```

#### ok

```ts
readonly ok: false;
```

The working tree is not clean, and this restore was rejected; persistent state is completely unchanged

#### reason

```ts
readonly reason: "dirty_working_tree";
```

Discriminator

***

### Type Literal

```ts
{
  incompatible: RestoreIncompatibility;
  ok: false;
  reason: "incompatible_schema";
}
```

#### incompatible

```ts
readonly incompatible: RestoreIncompatibility;
```

Stable description of the first incompatible node, **without patch content** (FR-050, FR-043)

#### ok

```ts
readonly ok: false;
```

There are entities this client does not recognize on the replay path; persistent state is completely unchanged

#### reason

```ts
readonly reason: "incompatible_schema";
```

Discriminator

***

### Type Literal

```ts
{
  ok: false;
  reason: "unreachable_target";
}
```

#### ok

```ts
readonly ok: false;
```

The target commit is not reachable from the current HEAD; persistent state is completely unchanged

#### reason

```ts
readonly reason: "unreachable_target";
```

Discriminator

## Remarks

The success exit has exactly four fields, **not one more**: when the caller wants to see "what was restored", the most convenient implementation is to copy
the patch and hang it on, and that patch may contain ciphertext of encrypted columns (FR-043). To see the content, use `diff()`; the restored
entries have the same shape there as hand-written changes.

`restoredCount: 0` plus `sessionId: null` is the full meaning of a no-op; no separate `noop` boolean is created — one more bit
is one more place that can disagree with `restoredCount` (FR-042).
