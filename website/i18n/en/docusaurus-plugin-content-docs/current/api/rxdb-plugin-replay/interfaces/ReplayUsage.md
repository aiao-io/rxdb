# ReplayUsage

Defined in: [packages/rxdb-plugin-replay/src/types.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L57)

Recording database usage (`usage()`).

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L59)

Sum of `bytes` across all sessions.

---

### limits \{#limits\}

```ts
readonly limits: object;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L61)

#### sessionBytes

```ts
readonly sessionBytes: number;
```

#### storeBytes

```ts
readonly storeBytes: number;
```

---

### sessionCount \{#sessioncount\}

```ts
readonly sessionCount: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L60)
