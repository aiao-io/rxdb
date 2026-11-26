---
sidebar_label: "RxDBDependencyInjection⟨T⟩"
---

# RxDBDependencyInjection`<T>`

Defined in: [rxdb-vue/src/rxdb-vue.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L43)

A set of mutually isolated providers / injectors produced by [makeRxDBDependencyInjector](../functions/makeRxDBDependencyInjector.md).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Properties

### injectRxDB \{#injectrxdb\}

```ts
injectRxDB: () => T | undefined;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L47)

Injects the current ready database instance; returns `undefined` when there is no provider or it is not ready.

#### Returns

`T` \| `undefined`

***

### injectRxDBRef \{#injectrxdbref\}

```ts
injectRxDBRef: (quiet?) => 
  | Readonly<Ref<T | undefined, T | undefined>>
  | undefined;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L49)

Injects the database's reactive reference; returns `undefined` when there is no provider, and does not warn when `quiet` is true.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `quiet?` | `boolean` |

#### Returns

  \| `Readonly`&lt;`Ref`&lt;`T` \| `undefined`, `T` \| `undefined`&gt;&gt;
  \| `undefined`

***

### provideRxDB \{#providerxdb\}

```ts
provideRxDB: (db) => void;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L45)

Provides the database on the current component for its descendants to inject.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `db` | [`RxDBInput`](../type-aliases/RxDBInput.md)&lt;`T`&gt; |

#### Returns

`void`
