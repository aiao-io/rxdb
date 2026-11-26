# decodeDesktopJsonPayload()

```ts
function decodeDesktopJsonPayload(value): unknown;
```

Defined in: [packages/rxdb-adapter-tauri/src/desktop-json-codec.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/desktop-json-codec.ts#L220)

Restores a JSON payload to the runtime types used by the protocol.

## Parameters

| Parameter | Type      | Description                    |
| --------- | --------- | ------------------------------ |
| `value`   | `unknown` | The payload after `JSON.parse` |

## Returns

`unknown`

A protocol payload containing `bigint` / `Uint8Array` / `Date`

## Remarks

When a tag's shape is invalid it **throws instead of returning as-is**: a malformed `$bigint` that
quietly travels upward as an ordinary object eventually explodes far from the scene in the form of
"rowIds is not a bigint array".

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) throws `protocol_violation` when a tag's shape is invalid
