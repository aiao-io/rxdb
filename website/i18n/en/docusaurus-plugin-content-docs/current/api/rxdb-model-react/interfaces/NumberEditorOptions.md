# NumberEditorOptions

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:3

Optional behavior configuration for the number editor

## Properties

### bigint? \{#bigint\}

```ts
bigint?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:5

true enables 64-bit big integer mode (value type bigint)

***

### max? \{#max\}

```ts
max?: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:9

Maximum value (inclusive)

***

### min? \{#min\}

```ts
min?: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:7

Minimum value (inclusive)

***

### step? \{#step\}

```ts
step?: number;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/number-editor.d.ts:11

Value step (aligned to min, tolerance 1e-8)
