# QueryDragDropHandler

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L26)

## Constructors

### Constructor

```ts
new QueryDragDropHandler(moveItemFn): QueryDragDropHandler;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L34)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `moveItemFn` | (`itemId`, `targetGroupId`, `targetIndex`) => `void` |

#### Returns

`QueryDragDropHandler`

## Properties

### state \{#state\}

```ts
readonly state: WritableSignal<QueryDragDropState>;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L27)

## Methods

### drop() \{#drop\}

```ts
drop(
   itemId, 
   targetGroupId, 
   targetIndex
): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L51)

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

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L60)

#### Returns

`void`

***

### leave() \{#leave\}

```ts
leave(): void;
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L47)

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

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L40)

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

Defined in: [packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-group/query-group.component.ts#L36)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `itemId` | `string` |

#### Returns

`void`
