# ReplayMarkerPayloads

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L27)

Payload shape of each marker tag.

## Properties

### rxdb-replay:commit \{#rxdb-replaycommit\}

```ts
readonly "rxdb-replay:commit": object;
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L28)

#### branchId

```ts
readonly branchId: string;
```

#### commitId

```ts
readonly commitId: string;
```

---

### rxdb-replay:gap \{#rxdb-replaygap\}

```ts
readonly "rxdb-replay:gap": object;
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L30)

#### reason

```ts
readonly reason: "stash_unavailable";
```

---

### rxdb-replay:truncated \{#rxdb-replaytruncated\}

```ts
readonly "rxdb-replay:truncated": object;
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L29)

#### code

```ts
readonly code: ReplayTruncatedCode;
```

#### limitBytes

```ts
readonly limitBytes: number;
```
