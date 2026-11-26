---
sidebar_label: 'QueryTableSnapshot⟨T⟩'
---

# QueryTableSnapshot`<T>`

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:5

Renderless snapshot of the query table reusing the list state.

## Extends

- [`EntityListSnapshot`](EntityListSnapshot.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### capabilities? \{#capabilities\}

```ts
readonly capabilities?: EntityCapabilities;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:18

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`capabilities`](EntityListSnapshot.md#capabilities)

---

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:17

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`error`](EntityListSnapshot.md#error)

---

### hasNext \{#hasnext\}

```ts
readonly hasNext: boolean | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:14

Whether there is a next page; empty when the data source does not provide a total count.

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`hasNext`](EntityListSnapshot.md#hasnext)

---

### loading \{#loading\}

```ts
readonly loading: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:16

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`loading`](EntityListSnapshot.md#loading)

---

### page \{#page\}

```ts
readonly page: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:8

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`page`](EntityListSnapshot.md#page)

---

### pageSize \{#pagesize\}

```ts
readonly pageSize: number;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:9

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`pageSize`](EntityListSnapshot.md#pagesize)

---

### query \{#query\}

```ts
readonly query: unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:6

#### Overrides

[`EntityListSnapshot`](EntityListSnapshot.md).[`query`](EntityListSnapshot.md#query)

---

### records \{#records\}

```ts
readonly records: readonly T[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:10

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`records`](EntityListSnapshot.md#records)

---

### selectedIds \{#selectedids\}

```ts
readonly selectedIds: readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:15

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`selectedIds`](EntityListSnapshot.md#selectedids)

---

### sorts \{#sorts\}

```ts
readonly sorts: readonly OrderBy<string>[];
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:7

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`sorts`](EntityListSnapshot.md#sorts)

---

### total \{#total\}

```ts
readonly total: number | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:12

The known total count; empty when the data source does not provide it.

#### Inherited from

[`EntityListSnapshot`](EntityListSnapshot.md).[`total`](EntityListSnapshot.md#total)
