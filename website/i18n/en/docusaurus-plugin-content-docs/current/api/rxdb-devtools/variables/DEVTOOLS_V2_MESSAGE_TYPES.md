# DEVTOOLS_V2_MESSAGE_TYPES

```ts
const DEVTOOLS_V2_MESSAGE_TYPES: readonly ["PROTOCOL_HELLO", "HANDSHAKE", "HANDSHAKE_ACK", "DISCONNECT", "PING", "PONG", "CLEAR_EVENT_BUFFER", "REQUEST", "RESPONSE", "ERROR", "EVENT", "TRANSFER_START", "TRANSFER_CHUNK", "TRANSFER_COMPLETE", "TRANSFER_CANCEL"];
```

Defined in: [v2/wire.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L50)

v2 message types.

## Remarks

Breaking rename relative to v1: the vague `CLEAR` becomes `CLEAR_EVENT_BUFFER`, with semantics narrowed to
"clear only this session's event buffer". Clearing the database / Storage / OPFS is defined by the `settings.clear` operation,
and the two travel completely different authorization paths (the former needs only `none`, the latter `full` + `mutationPolicy: allow`).
One name meaning both things was the most easily misused spot in v1.
