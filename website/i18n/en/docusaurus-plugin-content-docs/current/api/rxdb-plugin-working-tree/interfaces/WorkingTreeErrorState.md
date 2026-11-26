# WorkingTreeErrorState

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L83)

The call threw; the error has been normalized to `Error`, and the original instance is passed through as-is.

## Properties

### error \{#error\}

```ts
readonly error: Error;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L88)

The thrown error; both `instanceof` and `code` are preserved

***

### phase \{#phase\}

```ts
readonly phase: "error";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L85)

The discriminator bit
