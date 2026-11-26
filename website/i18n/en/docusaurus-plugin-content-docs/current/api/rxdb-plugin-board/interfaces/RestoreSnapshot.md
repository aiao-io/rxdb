# RestoreSnapshot

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L26)

State machine snapshot: state + this restore's target and the destination on failure.

## Properties

### failure \{#failure\}

```ts
readonly failure: 
  | {
  kind: "archive_invalid" | "restore_failed" | "readback_failed";
  reason: string;
}
  | null;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L37)

***

### pendingSwitch \{#pendingswitch\}

```ts
readonly pendingSwitch: boolean;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L36)

Whether the pending switch record is being written (after a reload, the new database is connected and read back based on it).

***

### restoringMarker \{#restoringmarker\}

```ts
readonly restoringMarker: boolean;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L34)

Whether the restoring marker is being written (all pages pause writes based on it): from selecting the archive until the read-back after reload succeeds or the failure cleanup runs.
It is still being written while switching — other pages writing the old database during the reload read-back window would leave those writes in a database that is no longer opened after the switch.

***

### state \{#state\}

```ts
readonly state: RestoreState;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L27)

***

### targetDbName \{#targetdbname\}

```ts
readonly targetDbName: string | null;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L29)

This restore's target database name: carried from selecting the archive through switching and restored; `null` before it starts, or after a failure / cancel (target already cleaned up).
