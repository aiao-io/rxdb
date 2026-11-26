# P2PProtocol

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L59)

A protocol supported by the local side.

## Properties

### handle \{#handle\}

```ts
readonly handle: (request) => 
  | P2PHandlerResult
  | Promise<P2PHandlerResult>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L67)

Handles a request from the peer; throwing [P2PRequestError](../classes/P2PRequestError.md) replies with its code, any other error replies with `internal`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `request` | [`P2PInboundRequest`](P2PInboundRequest.md) |

#### Returns

  \| [`P2PHandlerResult`](P2PHandlerResult.md)
  \| `Promise`&lt;[`P2PHandlerResult`](P2PHandlerResult.md)&gt;

***

### maxConcurrentRequests? \{#maxconcurrentrequests\}

```ts
readonly maxConcurrentRequests?: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L65)

Number of inbound requests handled simultaneously, 1-32, default 8; the rest queue, and a slot stays occupied when its reply cannot be sent.

***

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L61)

Protocol name, for example `p2p.files`; declared in hello.

***

### version \{#version\}

```ts
readonly version: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L63)

Protocol version (positive integer); supported only when both ends have the same version.
