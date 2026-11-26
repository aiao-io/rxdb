# EntityInstance

```ts
type EntityInstance = object;
```

Defined in: packages/rxdb-model/dist/entity-list/types.d.ts:12

RxDB entity instance (used for CRUD operations).

The three-framework component libraries (Angular / React / Vue) previously each inlined an identical copy; these now converge in the core package
and are passed through uniformly: Angular / Vue via the package root `export *` chain, React via the explicit re-export of the entity-list module.

## Indexable

```ts
[key: string]: unknown
```

## Properties

| Property | Modifier | Type | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-id"></a> `id` | `readonly` | `string` | packages/rxdb-model/dist/entity-list/types.d.ts:14 |

## Methods

### remove() \{#remove\}

```ts
remove(): Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-list/types.d.ts:16

#### Returns

`Promise`&lt;`void`&gt;

***

### save() \{#save\}

```ts
save(): Promise<void>;
```

Defined in: packages/rxdb-model/dist/entity-list/types.d.ts:15

#### Returns

`Promise`&lt;`void`&gt;
