# DevToolsErrorPayload

Defined in: [v2/errors.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L84)

The outgoing error envelope.

## Properties

### code \{#code\}

```ts
readonly code: DevToolsErrorCode;
```

Defined in: [v2/errors.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L86)

A code from the exhaustive union.

***

### message? \{#message\}

```ts
readonly message?: string;
```

Defined in: [v2/errors.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L90)

An optional redacted description; must pass [isRedactedErrorMessage](../functions/isRedactedErrorMessage.md).

***

### retryable \{#retryable\}

```ts
readonly retryable: boolean;
```

Defined in: [v2/errors.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L88)

Whether the panel may retry as-is.
