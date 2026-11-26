# FieldOptionDisplay

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L168)

Display metadata of a single enum option.

## Remarks

The single source of truth for option values is the `enum` array; this interface only carries display
information: deleting, disabling, or renaming a `label` cannot break existing data. `disabled` only affects
display, not the enum's validity.

## Properties

### color? \{#color\}

```ts
color?: string;
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L170)

***

### disabled? \{#disabled\}

```ts
disabled?: boolean;
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L171)

***

### label? \{#label\}

```ts
label?: string;
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L169)
