# NumberEditorOptions

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L7)

Optional behavior configuration for the number editor.

## Properties

### bigint? \{#bigint\}

```ts
bigint?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L9)

true means 64-bit big integer mode (value type bigint)

***

### max? \{#max\}

```ts
max?: number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L13)

The maximum value (inclusive)

***

### min? \{#min\}

```ts
min?: number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L11)

The minimum value (inclusive)

***

### step? \{#step\}

```ts
step?: number;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/number-editor.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/number-editor.ts#L15)

The value step (aligned to min, tolerance 1e-8)
