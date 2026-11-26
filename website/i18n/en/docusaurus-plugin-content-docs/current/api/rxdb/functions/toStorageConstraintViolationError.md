# toStorageConstraintViolationError()

```ts
function toStorageConstraintViolationError(cause, metadata, rows): unknown;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:303](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L303)

Storage constraint violation normalization for the write path: CHECK goes to [RxDBCheckViolationError](../classes/RxDBCheckViolationError.md), exclusion ranges go to
[RxDBExclusionViolationError](../classes/RxDBExclusionViolationError.md), everything else is returned unchanged.

## Parameters

| Parameter  | Type                                                             | Description                                                                                                              |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `cause`    | `unknown`                                                        | The raw error thrown by the adapter                                                                                      |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md)            | The metadata of the entity being written                                                                                 |
| `rows`     | readonly `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;[] | The rows the adapter itself sent (CHECK conflict values can only be taken from them, see `toCheckViolationErrorForRows`) |

## Returns

`unknown`

The normalized error, or the original error
