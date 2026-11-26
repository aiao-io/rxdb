# DevToolsErrorOptions

Defined in: [v2/errors.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L94)

The options when creating an error envelope.

## Properties

### message? \{#message\}

```ts
readonly message?: string;
```

Defined in: [v2/errors.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L98)

Static text; must not be concatenated from platform exceptions.

***

### retryable? \{#retryable\}

```ts
readonly retryable?: boolean;
```

Defined in: [v2/errors.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L96)

Defaults to `false`.
