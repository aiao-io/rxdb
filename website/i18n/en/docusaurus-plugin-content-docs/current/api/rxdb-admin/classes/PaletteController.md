# PaletteController

Defined in: [palette/controller.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L131)

Command palette controller: multi-source aggregation, synchronous fuzzy filtering, debouncing for async sources with stale-result protection, and recents.

## Remarks

The shell ships two built-in synchronous sources, "Menu" and "Commands"; apps can add their own sources, e.g. full-text search backed by `rxdb-plugin-search`.

## Implements

- [`ReadableStore`](../interfaces/ReadableStore.md)&lt;[`PaletteState`](../interfaces/PaletteState.md)&gt;

## Constructors

### Constructor

```ts
new PaletteController(options): PaletteController;
```

Defined in: [palette/controller.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L159)

Creates the controller.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`PaletteControllerOptions`](../interfaces/PaletteControllerOptions.md) | Preferences, storage, and debouncing. |

#### Returns

`PaletteController`

## Accessors

### changes$ \{#changes\}

#### Get Signature

```ts
get changes$(): Observable<PaletteState>;
```

Defined in: [palette/controller.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L151)

Replays the current state and pushes subsequent changes.

##### Returns

`Observable`&lt;[`PaletteState`](../interfaces/PaletteState.md)&gt;

An observable that replays the current value and pushes subsequent changes.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`changes$`](../interfaces/ReadableStore.md#changes)

***

### value \{#value\}

#### Get Signature

```ts
get value(): PaletteState;
```

Defined in: [palette/controller.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L146)

Snapshot of the current state.

##### Returns

[`PaletteState`](../interfaces/PaletteState.md)

Synchronous snapshot of the current value.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`value`](../interfaces/ReadableStore.md#value)

## Methods

### close() \{#close\}

```ts
close(): void;
```

Defined in: [palette/controller.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L203)

Closes the palette and cancels in-flight searches.

#### Returns

`void`

***

### hover() \{#hover\}

```ts
hover(index): void;
```

Defined in: [palette/controller.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L239)

Sets the selected item directly (mouse hover).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `index` | `number` | The index. |

#### Returns

`void`

***

### moveSelection() \{#moveselection\}

```ts
moveSelection(delta): void;
```

Defined in: [palette/controller.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L229)

Moves the selection, wrapping at the ends.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `delta` | `number` | The delta, usually ±1. |

#### Returns

`void`

***

### open() \{#open\}

```ts
open(): void;
```

Defined in: [palette/controller.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L197)

Opens the palette and clears the query.

#### Returns

`void`

***

### registerSource() \{#registersource\}

```ts
registerSource(source): () => void;
```

Defined in: [palette/controller.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L179)

Registers a result source.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | [`PaletteSource`](../interfaces/PaletteSource.md) | The source. |

#### Returns

Unregister function: aborts the source's in-flight searches and removes its results and failure notices;
  calling it after the same id has been replaced by another source, or repeatedly, does nothing.

() => `void`

#### Throws

Throws when the id is duplicated, or when the source is neither synchronous nor asynchronous.

***

### select() \{#select\}

```ts
select(index?): Promise<void>;
```

Defined in: [palette/controller.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L247)

Runs the selected item: closes the palette first so focus returns to the trigger.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `index?` | `number` | The index to run; defaults to the current selection. |

#### Returns

`Promise`&lt;`void`&gt;

***

### setQuery() \{#setquery\}

```ts
setQuery(query): void;
```

Defined in: [palette/controller.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L218)

Updates the query: synchronous sources filter immediately, async sources search after a debounce.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query text. |

#### Returns

`void`

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [palette/controller.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L168)

Subscribes to subsequent changes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | (`value`) => `void` | Change callback. |

#### Returns

An unsubscribe function.

() => `void`

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`subscribe`](../interfaces/ReadableStore.md#subscribe)

***

### toggle() \{#toggle\}

```ts
toggle(): void;
```

Defined in: [palette/controller.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L209)

Toggles the palette.

#### Returns

`void`
