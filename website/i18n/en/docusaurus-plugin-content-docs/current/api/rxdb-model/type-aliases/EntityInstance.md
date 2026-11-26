# EntityInstance

```ts
type EntityInstance = object;
```

Defined in: [packages/rxdb-model/src/entity-list/types.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L12)

RxDB entity instance (used for CRUD operations).

The three-framework component libraries (Angular / React / Vue) each previously inlined a same-shaped copy; it is now converged into the core package
and passed through uniformly: Angular / Vue via the package root's `export *` chain, React via an explicit re-export from the entity-list module.

## Indexable

```ts
[key: string]: unknown
```

## Properties

| Property                      | Modifier   | Type     | Defined in                                                                                                                                                                        |
| ----------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-id"></a> `id` | `readonly` | `string` | [packages/rxdb-model/src/entity-list/types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L14) |

## Methods

### remove() \{#remove\}

```ts
remove(): Promise<void>;
```

Defined in: [packages/rxdb-model/src/entity-list/types.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L16)

#### Returns

`Promise`&lt;`void`&gt;

---

### save() \{#save\}

```ts
save(): Promise<void>;
```

Defined in: [packages/rxdb-model/src/entity-list/types.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/types.ts#L15)

#### Returns

`Promise`&lt;`void`&gt;
