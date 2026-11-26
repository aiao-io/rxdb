# WriteEntranceDecision

```ts
type WriteEntranceDecision = 
  | {
  kind: "capture";
  origin: WriteEntryOrigin;
  pushableChange: boolean;
  revisionBump: true;
}
  | {
  kind: "no_capture";
  reason: NoCaptureReason;
  revisionBump: false;
}
  | {
  code: typeof commit_capability_mismatch;
  kind: "reject";
  revisionBump: false;
};
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L125)

The conclusion of [classifyWriteEntrance](../functions/classifyWriteEntrance.md).

## Union Members

### Type Literal

```ts
{
  kind: "capture";
  origin: WriteEntryOrigin;
  pushableChange: boolean;
  revisionBump: true;
}
```

#### kind

```ts
readonly kind: "capture";
```

This write is to become a working tree unit

#### origin

```ts
readonly origin: WriteEntryOrigin;
```

Whether the unit's author is a local user or the sync mechanism

#### pushableChange

```ts
readonly pushableChange: boolean;
```

Can this unit be pushed back to the remote; pushing a `remote_sync` unit back would be a push echo

#### revisionBump

```ts
readonly revisionBump: true;
```

Always `true`: landing the unit and incrementing the revision live and die together

***

### Type Literal

```ts
{
  kind: "no_capture";
  reason: NoCaptureReason;
  revisionBump: false;
}
```

#### kind

```ts
readonly kind: "no_capture";
```

This write proceeds as usual, but produces no unit

#### reason

```ts
readonly reason: NoCaptureReason;
```

Why it produces none

#### revisionBump

```ts
readonly revisionBump: false;
```

Always `false`

***

### Type Literal

```ts
{
  code: typeof commit_capability_mismatch;
  kind: "reject";
  revisionBump: false;
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

This write **must not happen at all**; the caller must throw before the statement is dispatched

#### revisionBump

```ts
readonly revisionBump: false;
```

Always `false`
