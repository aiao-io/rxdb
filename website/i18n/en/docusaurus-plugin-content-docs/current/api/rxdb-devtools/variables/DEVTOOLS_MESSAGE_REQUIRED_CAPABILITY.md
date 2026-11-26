# DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY

```ts
const DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY: object;
```

Defined in: [v2/authorization.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/authorization.ts#L42)

Minimum tier required for each message type.

## Type Declaration

### CLEAR\_EVENT\_BUFFER \{#clear_event_buffer\}

```ts
readonly CLEAR_EVENT_BUFFER: "none" = 'none';
```

### DISCONNECT \{#disconnect\}

```ts
readonly DISCONNECT: "none" = 'none';
```

### ERROR \{#error\}

```ts
readonly ERROR: "none" = 'none';
```

### EVENT \{#event\}

```ts
readonly EVENT: "readonly" = 'readonly';
```

### HANDSHAKE \{#handshake\}

```ts
readonly HANDSHAKE: "none" = 'none';
```

### HANDSHAKE\_ACK \{#handshake_ack\}

```ts
readonly HANDSHAKE_ACK: "none" = 'none';
```

### PING \{#ping\}

```ts
readonly PING: "none" = 'none';
```

### PONG \{#pong\}

```ts
readonly PONG: "none" = 'none';
```

### PROTOCOL\_HELLO \{#protocol_hello\}

```ts
readonly PROTOCOL_HELLO: "none" = 'none';
```

### REQUEST \{#request\}

```ts
readonly REQUEST: "readonly" = 'readonly';
```

### RESPONSE \{#response\}

```ts
readonly RESPONSE: "readonly" = 'readonly';
```

### TRANSFER\_CANCEL \{#transfer_cancel\}

```ts
readonly TRANSFER_CANCEL: "readonly" = 'readonly';
```

### TRANSFER\_CHUNK \{#transfer_chunk\}

```ts
readonly TRANSFER_CHUNK: "readonly" = 'readonly';
```

### TRANSFER\_COMPLETE \{#transfer_complete\}

```ts
readonly TRANSFER_COMPLETE: "readonly" = 'readonly';
```

### TRANSFER\_START \{#transfer_start\}

```ts
readonly TRANSFER_START: "readonly" = 'readonly';
```

## Remarks

`none` only lets lifecycle and protocol-mechanism frames through. Not a single piece of business data (`REQUEST` / `RESPONSE` / `EVENT` /
`TRANSFER_*`) may go out — `none` is not just "reject inbound commands"; it also means no event subscriptions,
no buffering, and no business data sent at all.

Written as `satisfies Record<DevToolsV2MessageType, …>`: adding a new message type without registering it fails to compile outright.
