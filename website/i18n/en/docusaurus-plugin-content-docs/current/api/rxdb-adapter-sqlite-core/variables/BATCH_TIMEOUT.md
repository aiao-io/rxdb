# BATCH_TIMEOUT

```ts
const BATCH_TIMEOUT: object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L23)

Change event batching timeout tiers (milliseconds).
The shorter, the lower the latency but the more frequent CPU wakeups; the longer, the more power saved but the more delayed UI response.
- `IMMEDIATE` (0): synchronous dispatch, for test scenarios only
- `FAST` (4):     merged within about one frame
- `BALANCED` (16): the default, about one frame (60fps)
- `POWER_SAVE` (50): mobile / background scenarios

## Type Declaration

### BALANCED \{#balanced\}

```ts
readonly BALANCED: 16 = 16;
```

### FAST \{#fast\}

```ts
readonly FAST: 4 = 4;
```

### IMMEDIATE \{#immediate\}

```ts
readonly IMMEDIATE: 0 = 0;
```

### POWER\_SAVE \{#power_save\}

```ts
readonly POWER_SAVE: 50 = 50;
```
