# toExclusionViolationError()

```ts
function toExclusionViolationError(cause, metadata): unknown;
```

Defined in: [packages/rxdb/src/system/exclusion-violation.ts:286](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-violation.ts#L286)

Normalizes the raw error of an exclusion-range violation into [RxDBExclusionViolationError](../classes/RxDBExclusionViolationError.md).

## Parameters

| Parameter  | Type                                                  | Description                                                                                                                 |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `cause`    | `unknown`                                             | The raw error thrown by the adapter; returned unchanged when it is not an exclusion-range violation declared by this entity |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Metadata of the entity being written                                                                                        |

## Returns

`unknown`

The normalized error, or the original error
