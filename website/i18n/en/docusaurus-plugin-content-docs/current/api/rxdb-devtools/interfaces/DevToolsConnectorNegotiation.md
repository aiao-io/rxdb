# DevToolsConnectorNegotiation

Defined in: [v2/negotiation-connector.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L64)

The connector negotiation machine.

## Properties

### negotiatedVersion \{#negotiatedversion\}

```ts
readonly negotiatedVersion: number | null;
```

Defined in: [v2/negotiation-connector.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L70)

The highest common version negotiated with the peer; `null` when there is no intersection.

---

### rejectedFrames \{#rejectedframes\}

```ts
readonly rejectedFrames: number;
```

Defined in: [v2/negotiation-connector.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L72)

The number of frames rejected by the state machine.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: [v2/negotiation-connector.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L68)

The session identity of this transport connection, minted at construction.

---

### state \{#state\}

```ts
readonly state: DevToolsConnectorNegotiationState;
```

Defined in: [v2/negotiation-connector.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L66)

The current state.

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [v2/negotiation-connector.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L86)

Stops responding.

#### Returns

`void`

---

### receive() \{#receive\}

```ts
receive(frame): void;
```

Defined in: [v2/negotiation-connector.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L84)

Processes one frame of inbound messages.

#### Parameters

| Parameter | Type      | Description                          |
| --------- | --------- | ------------------------------------ |
| `frame`   | `unknown` | A parsed, unvalidated inbound value. |

#### Returns

`void`

---

### start() \{#start\}

```ts
start(): void;
```

Defined in: [v2/negotiation-connector.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L78)

Sends the eager legacy HANDSHAKE.

#### Returns

`void`

#### Throws

TypeError when started repeatedly or after dispose.
