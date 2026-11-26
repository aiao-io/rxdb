# RepositorySyncCompleteEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:588](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L588)

Repository sync complete event

Fired when a repository sync operation completes successfully

## Constructors

### Constructor

```ts
new RepositorySyncCompleteEvent(
   direction,
   namespace,
   entity,
   result
): RepositorySyncCompleteEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:591](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L591)

#### Parameters

| Parameter                   | Type                                                                                                                                                         | Description            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `direction`                 | [`RepositorySyncDirection`](../type-aliases/RepositorySyncDirection.md)                                                                                      | Sync direction         |
| `namespace`                 | `string`                                                                                                                                                     | Namespace              |
| `entity`                    | `string`                                                                                                                                                     | Entity name            |
| `result`                    | \{ `compacted?`: `number`; `conflictsDeferred?`: `number`; `conflictsResolved?`: `number`; `failed?`: `number`; `pulled?`: `number`; `pushed?`: `number`; \} | Sync result statistics |
| `result.compacted?`         | `number`                                                                                                                                                     | -                      |
| `result.conflictsDeferred?` | `number`                                                                                                                                                     | -                      |
| `result.conflictsResolved?` | `number`                                                                                                                                                     | -                      |
| `result.failed?`            | `number`                                                                                                                                                     | -                      |
| `result.pulled?`            | `number`                                                                                                                                                     | -                      |
| `result.pushed?`            | `number`                                                                                                                                                     | -                      |

#### Returns

`RepositorySyncCompleteEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: RepositorySyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:593](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L593)

Sync direction

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:597](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L597)

Entity name

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:595](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L595)

Namespace

---

### result \{#result\}

```ts
readonly result: object;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:599](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L599)

Sync result statistics

#### compacted?

```ts
compacted?: number;
```

#### conflictsDeferred?

```ts
conflictsDeferred?: number;
```

#### conflictsResolved?

```ts
conflictsResolved?: number;
```

#### failed?

```ts
failed?: number;
```

#### pulled?

```ts
pulled?: number;
```

#### pushed?

```ts
pushed?: number;
```

---

### type \{#type\}

```ts
readonly type: "REPOSITORY_SYNC_COMPLETE" = REPOSITORY_SYNC_COMPLETE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:589](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L589)
