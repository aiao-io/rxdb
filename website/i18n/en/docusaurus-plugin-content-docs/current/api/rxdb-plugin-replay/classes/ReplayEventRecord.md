# ReplayEventRecord

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L76)

One rrweb event (table `replay_event`), existing only in the recording database.

## Remarks

Append-only; only `deleteSession()` removes rows. `data` is the whole `eventWithTime`, ready to be handed to the rrweb `Replayer` once read.

## Constructors

### Constructor

```ts
new ReplayEventRecord(): ReplayEventRecord;
```

#### Returns

`ReplayEventRecord`

## Properties

### bytes \{#bytes\}

```ts
bytes: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L90)

UTF-8 byte count of `JSON.stringify(data)`.

---

### data \{#data\}

```ts
data: eventWithTime;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L88)

The whole rrweb event.

---

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L78)

Primary key, `${sessionId}:${seq}`.

---

### seq \{#seq\}

```ts
seq: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L82)

Strictly increasing within a session, continuous across refreshes.

---

### sessionId \{#sessionid\}

```ts
sessionId: string;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L80)

Owning session (no foreign key is created; deletion is executed in order by the plugin).

---

### timestamp \{#timestamp\}

```ts
timestamp: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L86)

The `timestamp` of the rrweb event (epoch ms).

---

### type \{#type\}

```ts
type: number;
```

Defined in: [packages/rxdb-plugin-replay/src/entities.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/entities.ts#L84)

The rrweb `EventType` numeric value.
