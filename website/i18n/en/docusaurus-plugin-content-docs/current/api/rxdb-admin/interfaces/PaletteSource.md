# PaletteSource

Defined in: [palette/controller.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L24)

A results source. A synchronous source provides the full candidate set for the panel to fuzzy-filter; an asynchronous source returns results per query itself (e.g. full-text search).

## Properties

### groupLabel? \{#grouplabel\}

```ts
readonly groupLabel?: string;
```

Defined in: [palette/controller.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L30)

The group title literal.

***

### groupLabelKey? \{#grouplabelkey\}

```ts
readonly groupLabelKey?: string;
```

Defined in: [palette/controller.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L28)

The group title translation key.

***

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [palette/controller.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L26)

The unique identifier.

***

### items? \{#items\}

```ts
readonly items?: () => readonly PaletteItem[];
```

Defined in: [palette/controller.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L32)

The synchronous source: returns the full candidate set.

#### Returns

readonly [`PaletteItem`](PaletteItem.md)[]

***

### minQueryLength? \{#minquerylength\}

```ts
readonly minQueryLength?: number;
```

Defined in: [palette/controller.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L36)

The minimum query length that triggers the asynchronous source's search, 1 by default.

***

### remember? \{#remember\}

```ts
readonly remember?: boolean;
```

Defined in: [palette/controller.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L38)

Whether a selection is recorded into recent usage; synchronous sources record and asynchronous ones do not by default.

***

### search? \{#search\}

```ts
readonly search?: (query, signal) => Promise<readonly PaletteItem[]>;
```

Defined in: [palette/controller.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L34)

The asynchronous source: searches by query; `signal` is aborted when the query changes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `signal` | `AbortSignal` |

#### Returns

`Promise`&lt;readonly [`PaletteItem`](PaletteItem.md)[]&gt;
