# ReplayRestoreResult

```ts
type ReplayRestoreResult = 
  | {
  ok: true;
  restoredCount: number;
  sessionId: string | null;
  workingTreeRevision: number;
}
  | {
  ok: false;
  reason: ReplayRestoreRejection;
};
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L17)

Result of `restoreToCommit()`: the part of the working tree `restore()` result that replay uses.

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

#### restoredCount

```ts
readonly restoredCount: number;
```

Number of entries written into the working tree; `0` is a no-op

#### sessionId

```ts
readonly sessionId: string | null;
```

Id of the restore session established this time; `null` on a no-op

#### workingTreeRevision

```ts
readonly workingTreeRevision: number;
```

Working tree revision after this call

***

### Type Literal

```ts
{
  ok: false;
  reason: ReplayRestoreRejection;
}
```

## Remarks

Does not reference `WorkingTreeRestoreResult` of `@aiao/rxdb-plugin-working-tree` directly: it is an optional peer, and once a type import enters the
public signature it stays in the `.d.ts`, so strict consumers without it installed cannot even compile recording. The diagnostic details on rejection (`conflict` / `incompatible`)
are still on the object at runtime; if you need the type, use the working tree's `restore()` directly.
