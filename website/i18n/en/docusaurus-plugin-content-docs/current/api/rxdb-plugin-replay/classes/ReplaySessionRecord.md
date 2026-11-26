# ReplaySessionRecord

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L32)

A recording session (table `replay_session`), existing only in the recording database.

## Remarks

Applications should not read or write this entity directly; always go through `rxdb.replay`. `bytes` / `eventCount` / `nextSeq` / `lastEventAt`
only advance inside the same transaction that writes the event rows.

## Constructors

### Constructor

```ts
new ReplaySessionRecord(): ReplaySessionRecord;
```

#### Returns

`ReplaySessionRecord`

## Properties

### bytes \{#bytes\}

```ts
bytes: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L45)

Sum of the `bytes` of event rows already stored.

***

### eventCount \{#eventcount\}

```ts
eventCount: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L43)

Number of event rows already stored (including markers).

***

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L34)

Primary key, `crypto.randomUUID()` at `start()`.

***

### lastEventAt \{#lasteventat\}

```ts
lastEventAt: Date | null;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L38)

The largest event timestamp in the last batch successfully stored; `null` when there are no events yet.

***

### nextSeq \{#nextseq\}

```ts
nextSeq: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L47)

Lower bound of the `seq` of the next event to be stored.

***

### startedAt \{#startedat\}

```ts
startedAt: Date;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L36)

The moment of `start()`.

***

### status \{#status\}

```ts
status: ReplaySessionStatus;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L39)

***

### truncatedCode \{#truncatedcode\}

```ts
truncatedCode: ReplayTruncatedCode | null;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L41)

Always present when `status === 'truncated'`, otherwise `null`.
