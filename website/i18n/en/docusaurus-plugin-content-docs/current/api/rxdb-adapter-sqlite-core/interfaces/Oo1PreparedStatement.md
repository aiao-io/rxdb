# Oo1PreparedStatement

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L19)

Structural type alias of the `oo1` API, shared by `@sqlite.org/sqlite-wasm` and `@sqliteai/sqlite-wasm`.

## Naming origin

`oo1` is **not** an rxdb-coined abbreviation; it is the upstream official SQLite WASM API naming:
- `oo` = **Object Oriented** (object-oriented wrapper)
- `1` = the **1st generation** OO API

After initialization the runtime shapes are `sqlite3.oo1.DB` / `sqlite3.oo1.OpfsDb`, plus the lower-level `sqlite3.capi`. All the `Oo1*` types / base classes / helpers in this repository follow this layer, a completely different path from wa-sqlite's C-style pointer API (`db: number`).

Both upstream packages have their own `.d.ts`. The interfaces here are deliberately kept minimal so the shared base class / helper code neither relies on `any` nor couples to either side's type tree.

## Methods

### bind() \{#bind\}

```ts
bind(binding): this;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L20)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `binding` | `unknown`[] |

#### Returns

`this`

***

### finalize() \{#finalize\}

```ts
finalize(): number | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L24)

#### Returns

`number` \| `undefined`

***

### get() \{#get\}

```ts
get(target): unknown[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L21)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | `unknown`[] |

#### Returns

`unknown`[]

***

### getColumnNames() \{#getcolumnnames\}

```ts
getColumnNames(target?): string[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L22)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target?` | `string`[] |

#### Returns

`string`[]

***

### step() \{#step\}

```ts
step(): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L23)

#### Returns

`boolean`
