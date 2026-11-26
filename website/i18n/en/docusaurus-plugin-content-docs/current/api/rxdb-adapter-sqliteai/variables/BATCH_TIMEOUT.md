# BATCH_TIMEOUT

```ts
const BATCH_TIMEOUT: object;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/sqlite-client.utils.d.ts:20

Change event batching timeout tiers (milliseconds).
The shorter the lower latency but the more frequent CPU wakeups; the longer the
more power saved but the later UI responses.

- `IMMEDIATE` (0): synchronous dispatch, only for test scenarios
- `FAST` (4): coalesced within about one frame
- `BALANCED` (16): default, about one frame (60fps)
- `POWER_SAVE` (50): mobile / background scenarios

## Type Declaration

### BALANCED \{#balanced\}

```ts
readonly BALANCED: 16;
```

### FAST \{#fast\}

```ts
readonly FAST: 4;
```

### IMMEDIATE \{#immediate\}

```ts
readonly IMMEDIATE: 0;
```

### POWER\_SAVE \{#power_save\}

```ts
readonly POWER_SAVE: 50;
```
