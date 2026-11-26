# ISqlDialect

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L12)

SQL dialect interface
Defines database-specific SQL syntax conversion methods

## Methods

### escapeIdentifier() \{#escapeidentifier\}

```ts
escapeIdentifier(identifier): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L31)

Escapes an identifier (table name, column name, etc.)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `identifier` | `string` | The identifier |

#### Returns

`string`

The escaped identifier

***

### getConcatOperator() \{#getconcatoperator\}

```ts
getConcatOperator(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L43)

Gets the string concatenation operator

#### Returns

`string`

The string concatenation operator

***

### getJsonExtractOperator() \{#getjsonextractoperator\}

```ts
getJsonExtractOperator(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L37)

Gets the JSON extraction operator

#### Returns

`string`

The JSON extraction operator

***

### getParameterPlaceholder() \{#getparameterplaceholder\}

```ts
getParameterPlaceholder(index): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L24)

Gets the parameter placeholder

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `index` | `number` | Parameter index (1-based) |

#### Returns

`string`

The placeholder string

***

### getReturningClause() \{#getreturningclause\}

```ts
getReturningClause(): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/sql\_dialect.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/sql_dialect.ts#L17)

Gets the RETURNING clause for auto-increment primary keys

#### Returns

`string`

The RETURNING clause string
