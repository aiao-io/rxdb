# ReplaySessionExport

Defined in: [packages/rxdb-plugin-replay/src/types.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L65)

Result of `exportSession()`: session summary + all events ordered by `seq`.

## Properties

### events \{#events\}

```ts
readonly events: readonly eventWithTime[];
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L69)

***

### format \{#format\}

```ts
readonly format: "aiao-rxdb-replay-session";
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L66)

***

### session \{#session\}

```ts
readonly session: ReplaySessionInfo;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L68)

***

### version \{#version\}

```ts
readonly version: 1;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L67)
