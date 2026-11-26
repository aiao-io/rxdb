---
sidebar_label: "RepositoryConstructor⟨RT⟩"
---

# RepositoryConstructor`<RT>`

Defined in: [packages/rxdb/src/rxdb-adapter.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L119)

The facade repository's constructor type (registered via `RxDB.repository()`).

## Remarks

The two constructor signatures are not overloads but a **loosening device**: the first one,
`new (...args: never[])`, lets repository subclasses with extra generic type parameters be assigned in too
(their constructor parameters are not exactly the same as the second one's), while the second declares the
real calling shape. The parameter is `never[]` rather than `any[]`, so it only loosens assignment, not calls —
no one can actually construct via the first one.

The difference from [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md) is the
**first parameter**: a facade repository takes [RxDB](../classes/RxDB.md), an adapter repository takes the
adapter instance. The two axes register separately — do not mix them.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-rt"></a> `RT` *extends* [`RepositoryInstance`](RepositoryInstance.md) | [`RepositoryInstance`](RepositoryInstance.md) |

## Constructors

### Constructor

```ts
new RepositoryConstructor(...args): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L120)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `never`[] |

#### Returns

`RT`

### Constructor

```ts
new RepositoryConstructor(rxdb, EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L121)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../classes/RxDB.md) |
| `EntityType` | `RT`\[`"EntityType"`\] |

#### Returns

`RT`
