# QueryDragDropHandler

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L33)

Drag-and-drop state machine: records the dragged item, target item and drop mode, calls the move function on `drop` and resets.

## Constructors

### Constructor

```ts
new QueryDragDropHandler(moveItemFn): QueryDragDropHandler;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L42)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `moveItemFn` | (`itemId`, `targetGroupId`, `targetIndex`) => `void` |

#### Returns

`QueryDragDropHandler`

## Properties

### state \{#state\}

```ts
readonly state: Ref<QueryDragDropState>;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L35)

Current drag-and-drop state (reactive)

## Methods

### drop() \{#drop\}

```ts
drop(
   itemId, 
   targetGroupId, 
   targetIndex
): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L63)

Drop: calls the move function (silently ignored when the service layer rejects, e.g. circular nesting) and resets

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `itemId` | `string` |
| `targetGroupId` | `string` |
| `targetIndex` | `number` |

#### Returns

`void`

***

### end() \{#end\}

```ts
end(): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L73)

Drag ends (without dropping): resets

#### Returns

`void`

***

### leave() \{#leave\}

```ts
leave(): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L57)

Leaves the target: clears the target but keeps the dragged item

#### Returns

`void`

***

### over() \{#over\}

```ts
over(
   targetItemId, 
   dropMode, 
   isValid, 
   depth
): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L50)

Drag passes over a target: records the target and drop mode; deeper targets take priority

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `targetItemId` | `string` |
| `dropMode` | [`QueryDropMode`](../type-aliases/QueryDropMode.md) |
| `isValid` | `boolean` |
| `depth` | `number` |

#### Returns

`void`

***

### start() \{#start\}

```ts
start(itemId): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-group/query-drag-drop.ts#L45)

Starts dragging: records the dragged item

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `itemId` | `string` |

#### Returns

`void`
