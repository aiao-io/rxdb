# PaletteItem

Defined in: [palette/controller.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L8)

An executable entry in the command palette.

## Properties

### icon? \{#icon\}

```ts
readonly icon?: unknown;
```

Defined in: [palette/controller.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L18)

The icon; its type is determined by the three framework bindings.

***

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [palette/controller.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L10)

The unique identifier, used to record recent usage.

***

### keywords? \{#keywords\}

```ts
readonly keywords?: readonly string[];
```

Defined in: [palette/controller.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L16)

Extra search terms.

***

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [palette/controller.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L12)

The primary text.

***

### run \{#run\}

```ts
readonly run: () => void | Promise<void>;
```

Defined in: [palette/controller.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L20)

Executed when selected.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### sublabel? \{#sublabel\}

```ts
readonly sublabel?: string;
```

Defined in: [palette/controller.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/palette/controller.ts#L14)

The secondary text (the owning group, path).
