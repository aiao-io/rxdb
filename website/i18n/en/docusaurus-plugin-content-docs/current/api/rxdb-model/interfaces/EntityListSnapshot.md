---
sidebar_label: 'EntityListSnapshot⟨T⟩'
---

# EntityListSnapshot`<T>`

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L8)

List snapshot of the current query, pagination, selection, records, and capability constraints.

## Extended by

- [`QueryTableSnapshot`](QueryTableSnapshot.md)

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### capabilities? \{#capabilities\}

```ts
readonly capabilities?: EntityCapabilities;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L21)

---

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L20)

---

### hasNext \{#hasnext\}

```ts
readonly hasNext: boolean | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L17)

Whether there is a next page; empty when the data source does not provide a total.

---

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L19)

---

### page \{#page\}

```ts
readonly page: number;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L11)

---

### pageSize \{#pagesize\}

```ts
readonly pageSize: number;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L12)

---

### query \{#query\}

```ts
readonly query: unknown;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L9)

---

### records \{#records\}

```ts
readonly records: readonly T[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L13)

---

### selectedIds \{#selectedids\}

```ts
readonly selectedIds: readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L18)

---

### sorts \{#sorts\}

```ts
readonly sorts: readonly OrderBy<string>[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L10)

---

### total \{#total\}

```ts
readonly total: number | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L15)

Known total; empty when the data source does not provide it.
