# DevToolsPanelNegotiation

Defined in: [v2/negotiation-panel.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L56)

The panel negotiation machine.

## Properties

### downgraded \{#downgraded\}

```ts
readonly downgraded: boolean;
```

Defined in: [v2/negotiation-panel.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L62)

Already entered the v1 facade yet saw that the peer actually speaks v2 — hints the user to reconnect to upgrade.

***

### rejectedFrames \{#rejectedframes\}

```ts
readonly rejectedFrames: number;
```

Defined in: [v2/negotiation-panel.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L68)

The number of frames rejected by the state machine; "rejection" is countable, "silence" is not.

***

### rejection \{#rejection\}

```ts
readonly rejection: DevToolsErrorPayload | null;
```

Defined in: [v2/negotiation-panel.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L66)

The error reported by the peer during negotiation, such as `protocol_unsupported`.

***

### sessionId \{#sessionid\}

```ts
readonly sessionId: string | null;
```

Defined in: [v2/negotiation-panel.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L60)

The session after successful negotiation; `null` in all other states.

***

### stashedHandshake \{#stashedhandshake\}

```ts
readonly stashedHandshake: AnyDevToolsMessage | null;
```

Defined in: [v2/negotiation-panel.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L64)

The most recently stashed legacy handshake; within the window it is replaced by a later handshake.

***

### state \{#state\}

```ts
readonly state: DevToolsPanelNegotiationState;
```

Defined in: [v2/negotiation-panel.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L58)

The current state.

## Methods

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [v2/negotiation-panel.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L82)

Cancels the pending window and stops responding.

#### Returns

`void`

***

### receive() \{#receive\}

```ts
receive(frame): void;
```

Defined in: [v2/negotiation-panel.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L80)

Processes one frame of inbound messages.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `frame` | `unknown` | A parsed, unvalidated inbound value. |

#### Returns

`void`

***

### start() \{#start\}

```ts
start(): void;
```

Defined in: [v2/negotiation-panel.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L74)

Sends the first `PROTOCOL_HELLO`.

#### Returns

`void`

#### Throws

TypeError when started repeatedly or after dispose.
