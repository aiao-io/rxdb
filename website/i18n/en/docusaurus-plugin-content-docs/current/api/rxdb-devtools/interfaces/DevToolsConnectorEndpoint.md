# DevToolsConnectorEndpoint

Defined in: [v2/endpoint.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L109)

The connector-side v2 endpoint.

## Properties

### inflightDownloads \{#inflightdownloads\}

```ts
readonly inflightDownloads: number;
```

Defined in: [v2/endpoint.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L119)

The number of in-flight outbound (download) transfers.

---

### inflightRequests \{#inflightrequests\}

```ts
readonly inflightRequests: number;
```

Defined in: [v2/endpoint.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L115)

The number of in-flight requests.

---

### inflightTransfers \{#inflighttransfers\}

```ts
readonly inflightTransfers: number;
```

Defined in: [v2/endpoint.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L117)

The number of in-flight inbound transfers.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: [v2/endpoint.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L111)

The session identity minted by this endpoint; fixed at construction and unchanged whether or not the handshake succeeds.

---

### sessionOpen \{#sessionopen\}

```ts
readonly sessionOpen: boolean;
```

Defined in: [v2/endpoint.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L113)

Whether a v2 session has been established and is still held.

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [v2/endpoint.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L139)

Releases all timers, transfers and subscriptions.

#### Returns

`void`

---

### emitEvent() \{#emitevent\}

```ts
emitEvent(eventType, data): void;
```

Defined in: [v2/endpoint.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L137)

Sends an event pushed up by a provider to the panel.

#### Parameters

| Parameter   | Type      | Description                                                                                        |
| ----------- | --------- | -------------------------------------------------------------------------------------------------- |
| `eventType` | `string`  | The event type; its semantics are defined by the provider, and the endpoint does not interpret it. |
| `data`      | `unknown` | The event payload; the endpoint does not process it — masking is the provider's responsibility.    |

#### Returns

`void`

#### Remarks

Events are **pushed**, not the return value of an `invoke`: `database.events` only establishes the subscription, and every event after that is framed here. Having the provider accumulate them for panel polling would lose both ordering and backpressure at once.

When the sending conditions are not met, it is silently dropped without an error — events have no `requestId` and the peer has nothing waiting, so replying with an error would only fabricate a downstream frame on the `none` tier.

---

### receive() \{#receive\}

```ts
receive(frame): void;
```

Defined in: [v2/endpoint.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L123)

Processes one frame of inbound data; values that are not of this protocol are ignored outright.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `frame`   | `unknown` |

#### Returns

`void`

---

### start() \{#start\}

```ts
start(): void;
```

Defined in: [v2/endpoint.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L121)

Sends the eager v1 handshake and starts negotiation.

#### Returns

`void`
