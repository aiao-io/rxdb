# encodeDesktopJsonPayload()

```ts
function encodeDesktopJsonPayload(value): unknown;
```

Defined in: [packages/rxdb-adapter-tauri/src/desktop-json-codec.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/desktop-json-codec.ts#L163)

Encodes a protocol payload into a plain JSON-serializable shape.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | A protocol request, response, or change event |

## Returns

`unknown`

An equivalent payload containing only JSON-native types and tagged objects

## Remarks

`undefined` is handled in line with `JSON.stringify`: object properties are simply omitted, and
array holes are normalized to `null` — the latter being exactly the protocol's defined semantics
for binding parameters (see `normalizeBinding` in `desktop-host-protocol.ts`).

Non-finite numbers (`Infinity` / `-Infinity` / `NaN`), however, do **not** follow `JSON.stringify`.
It turns these three values into `null`, so an `INSERT` bound with `Infinity` would land a NULL in
SQLite — what got written is not the value the caller gave, and no error is reported anywhere along
the way. The Rust side's `encode_real` has long rejected them in the response direction
(`rust/src/value.rs`); here is the other half of the same property in the request direction.

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) throws `protocol_violation` when the payload contains non-finite numbers
