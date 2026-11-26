# P2PFrame

```ts
type P2PFrame = 
  | {
  credential: string;
  instanceId: string;
  kind: "hello";
  protocols: Readonly<Record<string, number>>;
  session: number;
}
  | {
  id: number;
  kind: "request";
  method: string;
  params: P2PJsonValue;
  payload: Uint8Array;
  protocol: string;
}
  | {
  id: number;
  kind: "response";
  payload: Uint8Array;
  result: P2PJsonValue;
}
  | {
  code: string;
  id: number;
  kind: "error";
  message: string;
}
  | {
  id: number;
  kind: "cancel";
}
  | {
  kind: "ping";
}
  | {
  kind: "pong";
}
  | {
  kind: "bye";
  reason: string;
};
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L27)

A session frame: JSON metadata plus a binary payload; only requests and replies carry payloads.

## Union Members

### Type Literal

```ts
{
  credential: string;
  instanceId: string;
  kind: "hello";
  protocols: Readonly<Record<string, number>>;
  session: number;
}
```

#### credential

```ts
readonly credential: string;
```

The sender's identity credential, issued by the auth host and bound to this connection.

#### instanceId

```ts
readonly instanceId: string;
```

The sender's running instance identifier.

#### kind

```ts
readonly kind: "hello";
```

Connection negotiation: the first frame each side sends.

#### protocols

```ts
readonly protocols: Readonly<Record<string, number>>;
```

The protocols the sender supports: protocol name to version.

#### session

```ts
readonly session: number;
```

Session protocol version.

***

### Type Literal

```ts
{
  id: number;
  kind: "request";
  method: string;
  params: P2PJsonValue;
  payload: Uint8Array;
  protocol: string;
}
```

#### id

```ts
readonly id: number;
```

Request number assigned by the sender, unique within this session.

#### kind

```ts
readonly kind: "request";
```

A request.

#### method

```ts
readonly method: string;
```

The method name within the protocol.

#### params

```ts
readonly params: P2PJsonValue;
```

JSON parameters.

#### payload

```ts
readonly payload: Uint8Array;
```

Binary payload.

#### protocol

```ts
readonly protocol: string;
```

Protocol name.

***

### Type Literal

```ts
{
  id: number;
  kind: "response";
  payload: Uint8Array;
  result: P2PJsonValue;
}
```

#### id

```ts
readonly id: number;
```

The corresponding request number.

#### kind

```ts
readonly kind: "response";
```

A successful reply.

#### payload

```ts
readonly payload: Uint8Array;
```

Binary payload.

#### result

```ts
readonly result: P2PJsonValue;
```

JSON result.

***

### Type Literal

```ts
{
  code: string;
  id: number;
  kind: "error";
  message: string;
}
```

#### code

```ts
readonly code: string;
```

Stable rejection reason.

#### id

```ts
readonly id: number;
```

The corresponding request number.

#### kind

```ts
readonly kind: "error";
```

A failed reply.

#### message

```ts
readonly message: string;
```

Diagnosable error text (truncated to the protocol limit when encoded).

***

### Type Literal

```ts
{
  id: number;
  kind: "cancel";
}
```

#### id

```ts
readonly id: number;
```

The number of the abandoned request.

#### kind

```ts
readonly kind: "cancel";
```

The requester abandons a request.

***

### Type Literal

```ts
{
  kind: "ping";
}
```

#### kind

```ts
readonly kind: "ping";
```

Heartbeat.

***

### Type Literal

```ts
{
  kind: "pong";
}
```

#### kind

```ts
readonly kind: "pong";
```

Heartbeat reply.

***

### Type Literal

```ts
{
  kind: "bye";
  reason: string;
}
```

#### kind

```ts
readonly kind: "bye";
```

Ends the session.

#### reason

```ts
readonly reason: string;
```

The end reason, for example `closed`, `unauthorized`, `duplicate`.
