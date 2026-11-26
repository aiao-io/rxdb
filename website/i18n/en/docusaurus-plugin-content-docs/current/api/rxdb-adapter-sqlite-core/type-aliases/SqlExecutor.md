# SqlExecutor

```ts
type SqlExecutor = object;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L15)

A transaction facade that can issue SQL directly.

## Remarks

Declares only `execute` rather than taking a whole `SqliteTransactionExecutor`: all the capability needed here is
"issue one SQL statement on the **current** transaction's connection"; narrowing it to this one method lets tests pass a minimal stand-in.

## Methods

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/with\_triggers\_disabled.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/with_triggers_disabled.ts#L16)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;
