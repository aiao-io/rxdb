# isRxDBBackupError()

```ts
function isRxDBBackupError(error, code?): error is RxDBBackupError;
```

Defined in: [packages/rxdb/src/backup/backup-error.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L95)

Determines whether a value is an [RxDBBackupError](../classes/RxDBBackupError.md) with the given code.

## Parameters

| Parameter | Type                                                            | Description                                                         |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `error`   | `unknown`                                                       | Any caught value                                                    |
| `code?`   | [`RxDBBackupErrorCode`](../type-aliases/RxDBBackupErrorCode.md) | The expected classification; when omitted, only the type is checked |

## Returns

`error is RxDBBackupError`

A type guard
