# BoardLabelService

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L31)

Board label service: create / rename / recolor and deletion that "confirms outside the transaction, re-verifies inside" (see file header).

## Constructors

### Constructor

```ts
new BoardLabelService(rxdb, ctx): BoardLabelService;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L32)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `ctx` | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |

#### Returns

`BoardLabelService`

## Methods

### createLabel() \{#createlabel\}

```ts
createLabel(input): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L37)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `color`: `string`; `name`: `string`; \} |
| `input.color` | `string` |
| `input.name` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;

***

### executeLabelDelete() \{#executelabeldelete\}

```ts
executeLabelDelete(plan): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L79)

Re-verifies inside the transaction and deletes: exits with zero writes when the sets changed; clears relations before deleting the definition, rolling back the whole batch on failure.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `plan` | [`LabelDeletePlan`](../interfaces/LabelDeletePlan.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### listLabels() \{#listlabels\}

```ts
listLabels(): Promise<BoardLabel[]>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L100)

All labels of the current board (ascending by creation time, by id within the same instant — the US-536 cross-framework comparison order).

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)[]&gt;

***

### planLabelDelete() \{#planlabeldelete\}

```ts
planLabelDelete(labelId): Promise<LabelDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L69)

Deletion plan: the label and all its relation rows (read outside the transaction).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`LabelDeletePlan`](../interfaces/LabelDeletePlan.md)&gt;

***

### recolorLabel() \{#recolorlabel\}

```ts
recolorLabel(labelId, color): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L61)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `color` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;

***

### renameLabel() \{#renamelabel\}

```ts
renameLabel(labelId, name): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board/src/label-service.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/label-service.ts#L53)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `name` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;
