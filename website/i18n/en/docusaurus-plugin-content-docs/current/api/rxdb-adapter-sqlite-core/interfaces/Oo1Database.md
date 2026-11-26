# Oo1Database

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L44)

Minimal contract of `sqlite3.oo1.DB` / `OpfsDb`: execute SQL, register functions, and close the connection.

## Properties

### pointer? \{#pointer\}

```ts
pointer?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L45)

## Methods

### changes() \{#changes\}

```ts
changes(total?, sixtyFour?): number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L55)

#### Parameters

| Parameter    | Type      |
| ------------ | --------- |
| `total?`     | `boolean` |
| `sixtyFour?` | `boolean` |

#### Returns

`number`

---

### close() \{#close\}

```ts
close(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L54)

#### Returns

`void`

---

### createFunction() \{#createfunction\}

```ts
createFunction(
   name,
   func,
   options?
): this;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L56)

#### Parameters

| Parameter  | Type                       |
| ---------- | -------------------------- |
| `name`     | `string`                   |
| `func`     | (...`args`) => `unknown`   |
| `options?` | `Oo1CreateFunctionOptions` |

#### Returns

`this`

---

### exec() \{#exec\}

```ts
exec(opts): this;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L47)

#### Parameters

| Parameter           | Type                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `opts`              | \{ `bind?`: `unknown`[]; `columnNames?`: `string`[]; `resultRows?`: `unknown`[][]; `rowMode?`: `string`; `sql`: `string`; \} |
| `opts.bind?`        | `unknown`[]                                                                                                                  |
| `opts.columnNames?` | `string`[]                                                                                                                   |
| `opts.resultRows?`  | `unknown`[][]                                                                                                                |
| `opts.rowMode?`     | `string`                                                                                                                     |
| `opts.sql`          | `string`                                                                                                                     |

#### Returns

`this`

---

### prepare()? \{#prepare\}

```ts
prepare ? sql : Oo1PreparedStatement;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L46)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `sql`     | `string` |

#### Returns

[`Oo1PreparedStatement`](Oo1PreparedStatement.md)
