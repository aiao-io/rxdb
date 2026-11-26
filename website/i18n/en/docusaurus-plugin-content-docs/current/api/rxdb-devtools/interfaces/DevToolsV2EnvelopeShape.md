# DevToolsV2EnvelopeShape

Defined in: [v2/wire.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L214)

The shape of a v2 message that has passed outer validation while its payload has not been validated yet.

## Properties

### direction \{#direction\}

```ts
readonly direction: DevToolsV2Direction;
```

Defined in: [v2/wire.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L217)

***

### payload \{#payload\}

```ts
readonly payload: unknown;
```

Defined in: [v2/wire.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L220)

***

### protocol \{#protocol\}

```ts
readonly protocol: 2;
```

Defined in: [v2/wire.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L216)

***

### sequence \{#sequence\}

```ts
readonly sequence: number;
```

Defined in: [v2/wire.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L222)

***

### sessionId \{#sessionid\}

```ts
readonly sessionId: string | null;
```

Defined in: [v2/wire.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L219)

***

### source \{#source\}

```ts
readonly source: "@aiao/rxdb-devtools";
```

Defined in: [v2/wire.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L215)

***

### timestamp \{#timestamp\}

```ts
readonly timestamp: number;
```

Defined in: [v2/wire.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L221)

***

### type \{#type\}

```ts
readonly type: 
  | "HANDSHAKE"
  | "HANDSHAKE_ACK"
  | "EVENT"
  | "DISCONNECT"
  | "PING"
  | "PROTOCOL_HELLO"
  | "PONG"
  | "CLEAR_EVENT_BUFFER"
  | "REQUEST"
  | "RESPONSE"
  | "ERROR"
  | "TRANSFER_START"
  | "TRANSFER_CHUNK"
  | "TRANSFER_COMPLETE"
  | "TRANSFER_CANCEL";
```

Defined in: [v2/wire.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L218)
