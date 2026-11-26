---
sidebar_label: "EntityListSnapshot⟨T⟩"
---

# EntityListSnapshot`<T>`

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:5

List snapshot of the current query, pagination, selection, records, and capability constraints.

## Extended by

- [`QueryTableSnapshot`](QueryTableSnapshot.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### capabilities? \{#capabilities\}

```ts
readonly capabilities?: EntityCapabilities;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:18

***

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:17

***

### hasNext \{#hasnext\}

```ts
readonly hasNext: boolean | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:14

Whether there is a next page; empty when the data source does not provide a total.

***

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:16

***

### page \{#page\}

```ts
readonly page: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:8

***

### pageSize \{#pagesize\}

```ts
readonly pageSize: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:9

***

### query \{#query\}

```ts
readonly query: unknown;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:6

***

### records \{#records\}

```ts
readonly records: readonly T[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:10

***

### selectedIds \{#selectedids\}

```ts
readonly selectedIds: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:15

***

### sorts \{#sorts\}

```ts
readonly sorts: readonly OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:7

***

### total \{#total\}

```ts
readonly total: number | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:12

The known total; empty when the data source does not provide one.
