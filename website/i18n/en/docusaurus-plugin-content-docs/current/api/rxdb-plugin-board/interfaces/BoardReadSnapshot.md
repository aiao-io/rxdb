# BoardReadSnapshot

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L11)

A complete read snapshot of one board; relations and tasks come from the same query round.

## Properties

### columns \{#columns\}

```ts
readonly columns: readonly Column[];
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L12)

---

### labels \{#labels\}

```ts
readonly labels: readonly BoardLabel[];
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L14)

---

### taskLabels \{#tasklabels\}

```ts
readonly taskLabels: ReadonlyMap<`${string}-${string}-${string}-${string}-${string}`, readonly BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L15)

---

### tasks \{#tasks\}

```ts
readonly tasks: readonly Task[];
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L13)
