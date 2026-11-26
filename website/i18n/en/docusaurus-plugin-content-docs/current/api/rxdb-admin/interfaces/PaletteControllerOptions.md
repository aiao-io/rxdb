# PaletteControllerOptions

Defined in: [palette/controller.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L103)

The construction options of [PaletteController](../classes/PaletteController.md).

## Properties

### debounceMs? \{#debouncems\}

```ts
readonly debounceMs?: number;
```

Defined in: [palette/controller.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L109)

The asynchronous source debounce in milliseconds, 150 by default.

***

### preferences \{#preferences\}

```ts
readonly preferences: ReadableStore<AdminPreferences>;
```

Defined in: [palette/controller.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L105)

The preferences: reads the per-group result limit and the recent usage count.

***

### recentsKey? \{#recentskey\}

```ts
readonly recentsKey?: string;
```

Defined in: [palette/controller.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L111)

The storage key of recent usage, defaulting to [PALETTE\_RECENTS\_KEY](../variables/PALETTE_RECENTS_KEY.md).

***

### storage \{#storage\}

```ts
readonly storage: StorageLike;
```

Defined in: [palette/controller.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L107)

The persistence medium of recent usage.
