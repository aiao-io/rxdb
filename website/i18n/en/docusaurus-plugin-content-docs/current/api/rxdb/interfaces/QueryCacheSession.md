---
sidebar_label: "QueryCacheSession⟨T⟩"
---

# QueryCacheSession`<T>`

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L58)

One engine session per QueryCache entity.

## Remarks

Its lifetime equals that of the holding [Repository](../classes/Repository.md), and it owns the "just synced" memory table — the primary repository
is **rebuilt on every emission** of the adapter stream, so memory kept on the primary repository would not survive a single `find`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L83)

Clears the memory.

#### Returns

`void`

#### Remarks

Two call sites: remote invalidation reports (must clear **synchronously**, otherwise the subsequent rerun hits stale memory) and
`Repository.destroy()` (every entry of the memory table carries a `setTimeout`; without clearing, the repository and its closures
stay pinned to the event loop until the window runs out on its own).

***

### createPrimary() \{#createprimary\}

```ts
createPrimary(localAdapter, remoteAdapter): QueryCachePrimary<T>;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L73)

Creates a primary repository.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `localAdapter` | `object` | The local adapter of this emission |
| `remoteAdapter` | `object` | The remote adapter of this emission |

#### Returns

[`QueryCachePrimary`](QueryCachePrimary.md)&lt;`T`&gt;

#### Remarks

Called once per emission of the adapter stream. The table-comparison semantics of "instance changed ⇒ clear the memory; unchanged ⇒ keep it" (US-020 AC#22)
are implemented on the implementation side — core only rebuilds along with the stream and does not know the memory exists.

Parameters take `object` rather than the two QueryCache adapter contracts: capability validation (whether the five duck methods are all present)
is the implementation's responsibility, and `RxDBQueryCacheCapabilityError` should be thrown on **the first call that really uses it**,
not by prematurely blocking unqualified adapters in core's type signature.
