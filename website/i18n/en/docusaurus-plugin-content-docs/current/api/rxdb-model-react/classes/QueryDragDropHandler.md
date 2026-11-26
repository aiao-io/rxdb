# QueryDragDropHandler

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L51)

Drag state manager (same class as the Angular side; signal → subscription model, consumed on the React side via useSyncExternalStore).

## Remarks

Angular's constructor takes `moveItemFn` directly; on the React side the service instance becomes ready during effects,
but the drag manager must be created on first render (React Compiler rules forbid creating closures that read refs during render),
so `moveItemFn` becomes an optional constructor parameter plus late binding via `setMoveItemFn` — behavior is equivalent.

## Constructors

### Constructor

```ts
new QueryDragDropHandler(moveItemFn?): QueryDragDropHandler;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L56)

#### Parameters

| Parameter     | Type                                                 |
| ------------- | ---------------------------------------------------- |
| `moveItemFn?` | (`itemId`, `targetGroupId`, `targetIndex`) => `void` |

#### Returns

`QueryDragDropHandler`

## Methods

### drop() \{#drop\}

```ts
drop(
   itemId,
   targetGroupId,
   targetIndex
): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L96)

Drops: calls moveItemFn and resets; resets silently when moveItemFn throws (e.g. cyclic nesting rejected by the service layer).

#### Parameters

| Parameter       | Type     |
| --------------- | -------- |
| `itemId`        | `string` |
| `targetGroupId` | `string` |
| `targetIndex`   | `number` |

#### Returns

`void`

---

### end() \{#end\}

```ts
end(): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L106)

Ends the drag (resets state).

#### Returns

`void`

---

### getState() \{#getstate\}

```ts
getState(): QueryDragDropState;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L66)

Current state snapshot.

#### Returns

[`QueryDragDropState`](../interfaces/QueryDragDropState.md)

---

### leave() \{#leave\}

```ts
leave(): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L91)

Clears the target but keeps the dragged item.

#### Returns

`void`

---

### over() \{#over\}

```ts
over(
   targetItemId,
   dropMode,
   isValid,
   depth
): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L84)

Records the target and drop mode (a deeper over wins: shallow events do not overwrite a deeper target).

#### Parameters

| Parameter      | Type                                                |
| -------------- | --------------------------------------------------- |
| `targetItemId` | `string`                                            |
| `dropMode`     | [`QueryDropMode`](../type-aliases/QueryDropMode.md) |
| `isValid`      | `boolean`                                           |
| `depth`        | `number`                                            |

#### Returns

`void`

---

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L110)

#### Returns

`void`

---

### setMoveItemFn() \{#setmoveitemfn\}

```ts
setMoveItemFn(moveItemFn): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L61)

Binds / replaces the moveItem implementation.

#### Parameters

| Parameter    | Type                                                 |
| ------------ | ---------------------------------------------------- |
| `moveItemFn` | (`itemId`, `targetGroupId`, `targetIndex`) => `void` |

#### Returns

`void`

---

### start() \{#start\}

```ts
start(itemId): void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L79)

Records the dragged item.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `itemId`  | `string` |

#### Returns

`void`

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L71)

Subscribes to state changes (useSyncExternalStore's subscribe).

#### Parameters

| Parameter  | Type         |
| ---------- | ------------ |
| `listener` | () => `void` |

#### Returns

() => `void`
