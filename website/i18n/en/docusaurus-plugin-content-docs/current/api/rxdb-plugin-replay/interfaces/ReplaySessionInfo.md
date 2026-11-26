# ReplaySessionInfo

Defined in: [packages/rxdb-plugin-replay/src/types.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L42)

Summary of one recording session (`listSessions()` / `exportSession()`).

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L53)

Sum of the byte counts of stored events (UTF-8 length after `JSON.stringify`).

---

### eventCount \{#eventcount\}

```ts
readonly eventCount: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L51)

Number of stored events (including markers).

---

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L43)

---

### lastEventAt \{#lasteventat\}

```ts
readonly lastEventAt: Date | null;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L46)

The largest event timestamp in the last batch successfully stored; `null` when there are no events yet.

---

### startedAt \{#startedat\}

```ts
readonly startedAt: Date;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L44)

---

### status \{#status\}

```ts
readonly status: ReplaySessionStatus;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L47)

---

### truncatedCode \{#truncatedcode\}

```ts
readonly truncatedCode: ReplayTruncatedCode | null;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L49)

Always present when `status === 'truncated'`, otherwise `null`.
