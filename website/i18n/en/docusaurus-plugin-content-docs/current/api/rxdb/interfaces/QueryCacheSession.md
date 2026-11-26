---
sidebar_label: "QueryCacheSession⟨T⟩"
---

# QueryCacheSession`<T>`

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L58)

One engine session per QueryCache entity.

## Remarks

Its lifetime equals that of the [Repository](../classes/Repository.md) holding it, and the "just synced" memory table belongs to it — the main repository
is **rebuilt on every emission** of the adapter stream, and putting the memory on the main repository means it would not survive a single `find`.

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

Two call sites: remote invalidation reporting (must clear **synchronously**, otherwise the subsequent rerun hits the stale memory) and
`Repository.destroy()` (every entry of the memory table holds a `setTimeout`; not clearing it pins the repository together with its closures
onto the event loop until the window runs out on its own).

***

### createPrimary() \{#createprimary\}

```ts
createPrimary(localAdapter, remoteAdapter): QueryCachePrimary<T>;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L73)

Builds a primary repository.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `localAdapter` | `object` | The local adapter of this emission |
| `remoteAdapter` | `object` | The remote adapter of this emission |

#### Returns

[`QueryCachePrimary`](QueryCachePrimary.md)&lt;`T`&gt;

#### Remarks

Called once per emission of the adapter stream. The table semantics of "instance changed ⇒ clear the memory, unchanged ⇒ reuse it" (US-020 AC#22)
are done on the implementation side — core only rebuilds per stream emission and knows nothing of the memory.

The parameters take `object` rather than the two QueryCache adapter contracts: capability validation (whether the five ducks are all present)
is the implementation's responsibility, and `RxDBQueryCacheCapabilityError` must be thrown on the **first call that actually uses it**,
not pre-blocked on core's type signature against unqualified adapters.
