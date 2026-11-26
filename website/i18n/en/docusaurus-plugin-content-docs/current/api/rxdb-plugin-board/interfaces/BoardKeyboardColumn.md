# BoardKeyboardColumn

Defined in: [packages/rxdb-plugin-board/src/keyboard.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/keyboard.ts#L25)

A column for keyboard moves: complete task sequence + visible sequence (filtered-out cards appear only in the complete sequence).

## Extends

- [`MenuMoveColumnView`](MenuMoveColumnView.md)

## Properties

### columnId \{#columnid\}

```ts
readonly columnId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L139)

#### Inherited from

[`MenuMoveColumnView`](MenuMoveColumnView.md).[`columnId`](MenuMoveColumnView.md#columnid)

---

### taskIds \{#taskids\}

```ts
readonly taskIds: readonly `${string}-${string}-${string}-${string}-${string}`[];
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L140)

#### Inherited from

[`MenuMoveColumnView`](MenuMoveColumnView.md).[`taskIds`](MenuMoveColumnView.md#taskids)

---

### visibleIds \{#visibleids\}

```ts
readonly visibleIds: readonly `${string}-${string}-${string}-${string}-${string}`[];
```

Defined in: [packages/rxdb-plugin-board/src/keyboard.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/keyboard.ts#L26)
