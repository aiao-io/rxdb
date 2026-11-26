# DEVTOOLS_V2_MESSAGE_DIRECTIONS

```ts
const DEVTOOLS_V2_MESSAGE_DIRECTIONS: object;
```

Defined in: [v2/wire.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L82)

Directions allowed for each message; `'both'` means bidirectional.

## Type Declaration

### CLEAR\_EVENT\_BUFFER \{#clear_event_buffer\}

```ts
readonly CLEAR_EVENT_BUFFER: "panel-to-connector" = 'panel-to-connector';
```

### DISCONNECT \{#disconnect\}

```ts
readonly DISCONNECT: "both" = 'both';
```

### ERROR \{#error\}

```ts
readonly ERROR: "connector-to-panel" = 'connector-to-panel';
```

### EVENT \{#event\}

```ts
readonly EVENT: "connector-to-panel" = 'connector-to-panel';
```

### HANDSHAKE \{#handshake\}

```ts
readonly HANDSHAKE: "connector-to-panel" = 'connector-to-panel';
```

### HANDSHAKE\_ACK \{#handshake_ack\}

```ts
readonly HANDSHAKE_ACK: "panel-to-connector" = 'panel-to-connector';
```

### PING \{#ping\}

```ts
readonly PING: "panel-to-connector" = 'panel-to-connector';
```

### PONG \{#pong\}

```ts
readonly PONG: "connector-to-panel" = 'connector-to-panel';
```

### PROTOCOL\_HELLO \{#protocol_hello\}

```ts
readonly PROTOCOL_HELLO: "panel-to-connector" = 'panel-to-connector';
```

### REQUEST \{#request\}

```ts
readonly REQUEST: "panel-to-connector" = 'panel-to-connector';
```

### RESPONSE \{#response\}

```ts
readonly RESPONSE: "connector-to-panel" = 'connector-to-panel';
```

### TRANSFER\_CANCEL \{#transfer_cancel\}

```ts
readonly TRANSFER_CANCEL: "both" = 'both';
```

### TRANSFER\_CHUNK \{#transfer_chunk\}

```ts
readonly TRANSFER_CHUNK: "both" = 'both';
```

### TRANSFER\_COMPLETE \{#transfer_complete\}

```ts
readonly TRANSFER_COMPLETE: "both" = 'both';
```

### TRANSFER\_START \{#transfer_start\}

```ts
readonly TRANSFER_START: "both" = 'both';
```

## Remarks

Directions are fixed in the protocol rather than self-declared by the sender, so a relay can block reverse injection without parsing the payload:
a `HANDSHAKE_ACK` with `direction: 'connector-to-panel'` can only be a forgery, because ownership of ACK
belongs to the panel (AC#1).
