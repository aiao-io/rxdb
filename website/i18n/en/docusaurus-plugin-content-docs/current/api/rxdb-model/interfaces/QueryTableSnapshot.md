---
sidebar_label: "QueryTableSnapshot⟨T⟩"
---

# QueryTableSnapshot`<T>`

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L11)

Renderless snapshot of a query table reusing list state.

## Extends

- [`EntityListSnapshot`](EntityListSnapshot.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### capabilities? \{#capabilities\}

```ts
readonly capabilities?: EntityCapabilities;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L21)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`capabilities`](EntityListSnapshot.md#capabilities)

***

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L20)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`error`](EntityListSnapshot.md#error)

***

### hasNext \{#hasnext\}

```ts
readonly hasNext: boolean | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L17)

Whether there is a next page; empty when the data source does not provide a total.

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`hasNext`](EntityListSnapshot.md#hasnext)

***

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L19)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`loading`](EntityListSnapshot.md#loading)

***

### page \{#page\}

```ts
readonly page: number;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L11)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`page`](EntityListSnapshot.md#page)

***

### pageSize \{#pagesize\}

```ts
readonly pageSize: number;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L12)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`pageSize`](EntityListSnapshot.md#pagesize)

***

### query \{#query\}

```ts
readonly query: unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L12)

#### Overrides

[`EntityListSnapshot`](EntityListSnapshot.md).[`query`](EntityListSnapshot.md#query)

***

### records \{#records\}

```ts
readonly records: readonly T[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L13)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`records`](EntityListSnapshot.md#records)

***

### selectedIds \{#selectedids\}

```ts
readonly selectedIds: readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L18)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`selectedIds`](EntityListSnapshot.md#selectedids)

***

### sorts \{#sorts\}

```ts
readonly sorts: readonly OrderBy<string>[];
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L10)

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`sorts`](EntityListSnapshot.md#sorts)

***

### total \{#total\}

```ts
readonly total: number | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L15)

Known total; empty when the data source does not provide it.

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`total`](EntityListSnapshot.md#total)
