# CardDropColumnView

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L18)

Column view: container rectangle + visible card rectangles + complete task sequence (including rows that are filtered out or outside the render window).

## Properties

### cards \{#cards\}

```ts
readonly cards: readonly object[];
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L21)

---

### columnId \{#columnid\}

```ts
readonly columnId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L19)

---

### rect \{#rect\}

```ts
readonly rect: object;
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L20)

#### bottom

```ts
readonly bottom: number;
```

#### left

```ts
readonly left: number;
```

#### right

```ts
readonly right: number;
```

#### top

```ts
readonly top: number;
```

---

### taskIds \{#taskids\}

```ts
readonly taskIds: readonly `${string}-${string}-${string}-${string}-${string}`[];
```

Defined in: [packages/rxdb-plugin-board/src/drop-resolution.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/drop-resolution.ts#L22)
