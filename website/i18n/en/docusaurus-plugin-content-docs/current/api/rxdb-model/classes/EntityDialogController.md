---
sidebar_label: "EntityDialogController⟨TResult, TData⟩"
---

# EntityDialogController`<TResult, TData>`

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L20)

Connects the consumer's dialog shell with open, close, and result state.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | `unknown` |
| <a id="type-parameter-tdata"></a> `TData` | `unknown` |

## Constructors

### Constructor

```ts
new EntityDialogController<TResult, TData>(options?): EntityDialogController<TResult, TData>;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L34)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt; |

#### Returns

`EntityDialogController`&lt;`TResult`, `TData`&gt;

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityDialogSnapshot<TResult, TData>;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L30)

Reads the current dialog lifecycle state.

##### Returns

[`EntityDialogSnapshot`](../interfaces/EntityDialogSnapshot.md)&lt;`TResult`, `TData`&gt;

## Methods

### close() \{#close\}

```ts
close(result?): void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L54)

Closes the dialog, optionally with a close result.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result?` | `TResult` |

#### Returns

`void`

***

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L78)

Cleans up all listeners and rejects subsequent lifecycle actions.

#### Returns

`void`

***

### open() \{#open\}

```ts
open(data?): void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L46)

Opens the dialog and clears the previous result.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data?` | `TData` |

#### Returns

`void`

***

### resolve() \{#resolve\}

```ts
resolve(result): void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L61)

Commits the result and closes the dialog.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | `TResult` |

#### Returns

`void`

***

### setData() \{#setdata\}

```ts
setData(data): void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L71)

Replaces the data used by the consumer's dialog; does nothing when it is structurally the same as the most recent data.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `TData` \| `undefined` |

#### Returns

`void`

#### Remarks

Compared with `structuralEqual` (functions by reference), so bindings that rebuild an equal object on every render do not publish repeatedly and cause re-render loops.

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L40)

Subscribes to open, close, data, and result events.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | `DialogListener`&lt;`TResult`, `TData`&gt; |

#### Returns

() => `void`
