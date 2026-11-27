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
      reason: 'conflict';
    }
  | {
      ok: false;
      reason: 'dirty_working_tree';
    }
  | {
      incompatible: RestoreIncompatibility;
      ok: false;
      reason: 'incompatible_schema';
    }
  | {
      ok: false;
      reason: 'unreachable_target';
    };
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-command.ts#L102)

The result of a `restore()` call.

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

This restore has been persisted; with `restoredCount: 0` it is a no-op that wrote nothing

#### restoredCount

```ts
readonly restoredCount: number;
```

The number of entries written into the working tree

#### sessionId

```ts
readonly sessionId: string | null;
```

The id of the restore session created this time; `null` on a no-op (no session was created)

#### workingTreeRevision

```ts
readonly workingTreeRevision: number;
```

The working tree revision after this call; on a no-op, the value from before the call

---

### Type Literal

```ts
{
  conflict: CommitConflict;
  ok: false;
  reason: 'conflict';
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

The three captured slots do not match, or the CAS missed; not a single byte was persisted

#### reason

```ts
readonly reason: "conflict";
```

The discriminator

---

### Type Literal

```ts
{
  ok: false;
  reason: 'dirty_working_tree';
}
```

#### ok

```ts
readonly ok: false;
```

The working tree is not clean, and this restore was rejected; persistent state is unchanged

#### reason

```ts
readonly reason: "dirty_working_tree";
```

The discriminator

---

### Type Literal

```ts
{
  incompatible: RestoreIncompatibility;
  ok: false;
  reason: 'incompatible_schema';
}
```

#### incompatible

```ts
readonly incompatible: RestoreIncompatibility;
```

The stable description of the first incompatible node, **with no patch content** (FR-050, FR-043)

#### ok

```ts
readonly ok: false;
```

The replay path contains entities this client does not recognize; persistent state is unchanged

#### reason

```ts
readonly reason: "incompatible_schema";
```

The discriminator

---

### Type Literal

```ts
{
  ok: false;
  reason: 'unreachable_target';
}
```

#### ok

```ts
readonly ok: false;
```

The target commit cannot be reached from the current HEAD; persistent state is unchanged

#### reason

```ts
readonly reason: "unreachable_target";
```

The discriminator

## Remarks

The success exit has exactly four fields, **not one more**: when a caller wants to see "what was restored",
the handiest implementation is to copy the patch onto it, and that patch may hold ciphertext of encrypted
columns (FR-043). To see the content, use `diff()` — restored entries have the same shape there as
hand-written changes.

`restoredCount: 0` plus `sessionId: null` is the entire meaning of a no-op; no separate `noop` boolean bit is
added — one more bit is one more place that can disagree with `restoredCount` (FR-042).
