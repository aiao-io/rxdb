# EntityInstance

```ts
type EntityInstance = object;
```

Defined in: packages/rxdb-model/dist/entity-list/types.d.ts:12

RxDB entity instance (used for CRUD operations).

The three-framework component libraries (Angular / React / Vue) previously inlined same-shaped copies each; now consolidated in the core package
and re-exported uniformly: Angular / Vue via the package root `export *` chain, React via an explicit re-export from the entity-list module.

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
