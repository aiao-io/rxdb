---
sidebar_label: 'EntityDialogController⟨TResult, TData⟩'
---

# EntityDialogController`<TResult, TData>`

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:16

Connects the consuming dialog shell's open, close, and result state.

## Type Parameters

| Type Parameter                                | Default type |
| --------------------------------------------- | ------------ |
| <a id="type-parameter-tresult"></a> `TResult` | `unknown`    |
| <a id="type-parameter-tdata"></a> `TData`     | `unknown`    |

## Constructors

### Constructor

```ts
new EntityDialogController<TResult, TData>(options?): EntityDialogController<TResult, TData>;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:20

#### Parameters

| Parameter  | Type                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `options?` | [`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt; |

#### Returns

`EntityDialogController`&lt;`TResult`, `TData`&gt;

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityDialogSnapshot<TResult, TData>;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:19

Reads the current dialog lifecycle state.

##### Returns

[`EntityDialogSnapshot`](../interfaces/EntityDialogSnapshot.md)&lt;`TResult`, `TData`&gt;

## Methods

### close() \{#close\}

```ts
close(result?): void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:26

Closes the dialog, optionally with a close result.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `result?` | `TResult` |

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:35

Cleans up all listeners and rejects subsequent lifecycle actions.

#### Returns

`void`

---

### open() \{#open\}

```ts
open(data?): void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:24

Opens the dialog and clears the previous result.

#### Parameters

| Parameter | Type    |
| --------- | ------- |
| `data?`   | `TData` |

#### Returns

`void`

---

### resolve() \{#resolve\}

```ts
resolve(result): void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:28

Commits the result and closes the dialog.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `result`  | `TResult` |

#### Returns

`void`

---

### setData() \{#setdata\}

```ts
setData(data): void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:33

Replaces the data used by the consuming dialog; does nothing when the data is structurally identical to the most recent value.

#### Parameters

| Parameter | Type                   |
| --------- | ---------------------- |
| `data`    | `TData` \| `undefined` |

#### Returns

`void`

#### Remarks

Compared via `structuralEqual` (functions by reference), so a binding that rebuilds an object with the same content on every render does not publish repeatedly and cause re-render loops.

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:22

Subscribes to open, close, data, and result events.

#### Parameters

| Parameter  | Type                                       |
| ---------- | ------------------------------------------ |
| `listener` | `DialogListener`&lt;`TResult`, `TData`&gt; |

#### Returns

() => `void`
