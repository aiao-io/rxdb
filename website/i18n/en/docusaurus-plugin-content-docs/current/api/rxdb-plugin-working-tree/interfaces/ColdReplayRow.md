# ColdReplayRow

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L43)

One business data row: identity + all column values.

## Extends

- [`ColdReplayIdentity`](ColdReplayIdentity.md)

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L36)

The entity name

#### Inherited from

[`ColdReplayIdentity`](ColdReplayIdentity.md).[`entity`](ColdReplayIdentity.md#entity)

---

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L39)

The entity primary key

#### Inherited from

[`ColdReplayIdentity`](ColdReplayIdentity.md).[`entityId`](ColdReplayIdentity.md#entityid)

---

### fields \{#fields\}

```ts
readonly fields: Readonly<Record<string, unknown>>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L45)

Column name → column value; a missing key and a key with `null` are **two different things**

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/cold-replay.ts#L33)

The namespace the entity belongs to

#### Inherited from

[`ColdReplayIdentity`](ColdReplayIdentity.md).[`namespace`](ColdReplayIdentity.md#namespace)
