# BoardShellState

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L46)

Shell state snapshot: the shell component renders only this.

## Properties

### canSeed \{#canseed\}

```ts
readonly canSeed: boolean;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L58)

The host provided demo data: show "Load demo data / Reset to demo data".

---

### confirm \{#confirm\}

```ts
readonly confirm: BoardShellConfirm | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L54)

The operation awaiting confirmation; `null` means no confirmation dialog.

---

### error \{#error\}

```ts
readonly error: string | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L52)

The description of the most recent failure (shown on both the startup page and the board page); cleared after a new database is successfully opened.

---

### phase \{#phase\}

```ts
readonly phase: BoardShellPhase;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L48)

The current phase: the component switches between startup page / preparing / restoring / board based on it.

---

### restore \{#restore\}

```ts
readonly restore: RestoreSnapshot;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L56)

The snapshot of the restore flow started by this page; rebuilt as "switching" from the pending switch record after a reload.

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L50)

The currently opened board instance; handed to the board view only in the `board` phase.
