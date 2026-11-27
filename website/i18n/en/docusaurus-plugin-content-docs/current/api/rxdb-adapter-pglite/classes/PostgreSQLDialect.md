# PostgreSQLDialect

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L56)

PostgreSQL dialect implementation

Key differences:

- Parameter placeholders: $1, $2, $3 (instead of SQLite's ?)
- RETURNING clause: supports returning inserted/updated rows
- Identifier escaping: double quotes
- JSON operators: -\>\> and -\>
- String concatenation: ||

## Implements

- [`ISqlDialect`](../interfaces/ISqlDialect.md)

## Constructors

### Constructor

```ts
new PostgreSQLDialect(): PostgreSQLDialect;
```

#### Returns

`PostgreSQLDialect`

## Methods

### escapeIdentifier() \{#escapeidentifier\}

```ts
escapeIdentifier(identifier): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L65)

Escapes an identifier (table name, column name, etc.)

#### Parameters

| Parameter    | Type     | Description    |
| ------------ | -------- | -------------- |
| `identifier` | `string` | The identifier |

#### Returns

`string`

The escaped identifier

#### Implementation of

[`ISqlDialect`](../interfaces/ISqlDialect.md).[`escapeIdentifier`](../interfaces/ISqlDialect.md#escapeidentifier)

---

### generateBatchInsert() \{#generatebatchinsert\}

```ts
generateBatchInsert(
   tableName,
   columns,
   rowCount
): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L87)

Generates batch insert SQL (with RETURNING)

#### Parameters

| Parameter   | Type       | Description           |
| ----------- | ---------- | --------------------- |
| `tableName` | `string`   | Table name            |
| `columns`   | `string`[] | Array of column names |
| `rowCount`  | `number`   | Number of rows        |

#### Returns

`string`

SQL statement

---

### generateBatchUpdate() \{#generatebatchupdate\}

```ts
generateBatchUpdate(
   tableName,
   pkColumn,
   updateColumns,
   rowCount?,
   columnTypes?
): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L125)

Generates batch update SQL (using the UPDATE ... FROM pattern)

Each row occupies `1 + updateColumns.length` parameters, in the order "primary key, ...update columns".

The original implementation always generated `FROM (VALUES ($1))` while declaring an alias list of 1+N columns, and did not escape the update column names — feeding that into PG gives 42P10
(`table "temp" has 1 columns available but N columns specified`),
and three existing test cases had baked this shape in with `toContain` as the expected value (PGL-014).

Parameters inside `VALUES` are text in PG's eyes. When the target column is not a text type, the target type must be supplied via `columnTypes`, otherwise PG reports
`column "age" is of type integer but expression is of type text` —
this method has no access to entity metadata, so types can only be supplied by the caller.

#### Parameters

| Parameter       | Type                                                 | Default value | Description                                                                                           |
| --------------- | ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `tableName`     | `string`                                             | `undefined`   | Table name                                                                                            |
| `pkColumn`      | `string`                                             | `undefined`   | Primary key column name                                                                               |
| `updateColumns` | `string`[]                                           | `undefined`   | Array of update column names                                                                          |
| `rowCount?`     | `number`                                             | `1`           | Number of rows in the batch, default 1                                                                |
| `columnTypes?`  | `Readonly`&lt;`Record`&lt;`string`, `string`&gt;&gt; | `{}`          | Column name → PostgreSQL type, used to generate `::type` casts; columns not given are treated as text |

#### Returns

`string`

SQL template

#### Throws

When `rowCount` is less than 1 or `updateColumns` is empty

---

### getConcatOperator() \{#getconcatoperator\}

```ts
getConcatOperator(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L76)

Gets the string concatenation operator

#### Returns

`string`

The string concatenation operator

#### Implementation of

[`ISqlDialect`](../interfaces/ISqlDialect.md).[`getConcatOperator`](../interfaces/ISqlDialect.md#getconcatoperator)

---

### getJsonExtractOperator() \{#getjsonextractoperator\}

```ts
getJsonExtractOperator(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L71)

Gets the JSON extract operator

#### Returns

`string`

The JSON extract operator

#### Implementation of

[`ISqlDialect`](../interfaces/ISqlDialect.md).[`getJsonExtractOperator`](../interfaces/ISqlDialect.md#getjsonextractoperator)

---

### getParameterPlaceholder() \{#getparameterplaceholder\}

```ts
getParameterPlaceholder(index): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L61)

Gets the parameter placeholder

#### Parameters

| Parameter | Type     | Description               |
| --------- | -------- | ------------------------- |
| `index`   | `number` | Parameter index (1-based) |

#### Returns

`string`

The placeholder string

#### Implementation of

[`ISqlDialect`](../interfaces/ISqlDialect.md).[`getParameterPlaceholder`](../interfaces/ISqlDialect.md#getparameterplaceholder)

---

### getReturningClause() \{#getreturningclause\}

```ts
getReturningClause(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L57)

Gets the RETURNING clause for auto-increment primary keys

#### Returns

`string`

The RETURNING clause string

#### Implementation of

[`ISqlDialect`](../interfaces/ISqlDialect.md).[`getReturningClause`](../interfaces/ISqlDialect.md#getreturningclause)
