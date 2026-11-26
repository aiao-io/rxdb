# declaredCheckViolationOf()

```ts
function declaredCheckViolationOf(cause, metadata): string | undefined;
```

Defined in: [packages/rxdb/src/system/check-violation.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/check-violation.ts#L64)

Judges whether the raw error is a CHECK violation declared in the metadata (used to decide whether the message should carry the conflicting value).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cause` | `unknown` | The raw error thrown by the adapter |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Metadata of the entity being written |

## Returns

`string` \| `undefined`

Returns the constraint name when a declared CHECK can be traced back.
