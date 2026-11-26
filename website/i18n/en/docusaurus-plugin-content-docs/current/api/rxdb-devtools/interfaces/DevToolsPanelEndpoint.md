# DevToolsPanelEndpoint

Defined in: [v2/panel-endpoint.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L154)

The panel data plane client.

## Properties

### capability \{#capability\}

```ts
readonly capability: DevToolsCapability | null;
```

Defined in: [v2/panel-endpoint.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L164)

The tier declared by the connector; `null` when negotiation has not succeeded.

---

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/panel-endpoint.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L166)

The provider descriptors declared by the connector; empty when negotiation has not succeeded.

---

### downgraded \{#downgraded\}

```ts
readonly downgraded: boolean;
```

Defined in: [v2/panel-endpoint.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L162)

Already entered the v1 facade but discovered the peer speaks v2 — hints the user to reconnect to upgrade.

---

### inflightRequests \{#inflightrequests\}

```ts
readonly inflightRequests: number;
```

Defined in: [v2/panel-endpoint.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L168)

The number of in-flight requests.

---

### inflightTransfers \{#inflighttransfers\}

```ts
readonly inflightTransfers: number;
```

Defined in: [v2/panel-endpoint.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L170)

The number of in-flight uploads.

---

### rejectedFrames \{#rejectedframes\}

```ts
readonly rejectedFrames: number;
```

Defined in: [v2/panel-endpoint.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L174)

The number of rejected frames (including those rejected by the negotiation machine); "rejection" is countable, "silence" is not.

---

### rejection \{#rejection\}

```ts
readonly rejection: DevToolsErrorPayload | null;
```

Defined in: [v2/panel-endpoint.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L172)

The error reported by the peer during negotiation.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string | null;
```

Defined in: [v2/panel-endpoint.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L158)

The current session; `null` when not negotiated or already disconnected.

---

### sessionOpen \{#sessionopen\}

```ts
readonly sessionOpen: boolean;
```

Defined in: [v2/panel-endpoint.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L160)

Whether the session is still open.

---

### state \{#state\}

```ts
readonly state: DevToolsPanelNegotiationState;
```

Defined in: [v2/panel-endpoint.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L156)

The negotiation state.

## Methods

### clearEventBuffer() \{#cleareventbuffer\}

```ts
clearEventBuffer(): void;
```

Defined in: [v2/panel-endpoint.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L210)

Requests the connector to clear this session's event buffer.

#### Returns

`void`

---

### disconnect() \{#disconnect\}

```ts
disconnect(): void;
```

Defined in: [v2/panel-endpoint.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L214)

Disconnects proactively: sends `DISCONNECT` and settles all in-flight work in place.

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [v2/panel-endpoint.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L216)

Stops sending/receiving and settles all in-flight work.

#### Returns

`void`

---

### download() \{#download\}

```ts
download(request): Promise<DevToolsPanelDownloadResult>;
```

Defined in: [v2/panel-endpoint.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L201)

Drives a `files.download`.

#### Parameters

| Parameter | Type                                                              | Description                               |
| --------- | ----------------------------------------------------------------- | ----------------------------------------- |
| `request` | [`DevToolsPanelDownloadRequest`](DevToolsPanelDownloadRequest.md) | The params constructor and the byte sink. |

#### Returns

`Promise`&lt;[`DevToolsPanelDownloadResult`](../type-aliases/DevToolsPanelDownloadResult.md)&gt;

A result that never rejects; for the semantics of the three branches see [DevToolsPanelDownloadResult](../type-aliases/DevToolsPanelDownloadResult.md).

---

### onEvent() \{#onevent\}

```ts
onEvent(listener): () => void;
```

Defined in: [v2/panel-endpoint.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L208)

Subscribes to events pushed by the connector.

#### Parameters

| Parameter  | Type                | Description         |
| ---------- | ------------------- | ------------------- |
| `listener` | (`event`) => `void` | The event callback. |

#### Returns

An unsubscribe function; idempotent.

() => `void`

---

### ping() \{#ping\}

```ts
ping(): void;
```

Defined in: [v2/panel-endpoint.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L212)

Sends a `PING`.

#### Returns

`void`

---

### receive() \{#receive\}

```ts
receive(frame): void;
```

Defined in: [v2/panel-endpoint.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L178)

Processes one frame of inbound messages.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `frame`   | `unknown` |

#### Returns

`void`

---

### request() \{#request\}

```ts
request(
   domain,
   operation,
   params
): Promise<DevToolsPanelRequestResult>;
```

Defined in: [v2/panel-endpoint.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L187)

Issues a provider call.

#### Parameters

| Parameter   | Type                                      | Description                                                      |
| ----------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `domain`    | `"database"` \| `"files"` \| `"settings"` | The provider domain.                                             |
| `operation` | `string`                                  | The operation name within the domain.                            |
| `params`    | `unknown`                                 | The operation parameters, constructed per the provider contract. |

#### Returns

`Promise`&lt;[`DevToolsPanelRequestResult`](../type-aliases/DevToolsPanelRequestResult.md)&gt;

A result that never rejects.

---

### start() \{#start\}

```ts
start(): void;
```

Defined in: [v2/panel-endpoint.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L176)

Sends the first `PROTOCOL_HELLO`.

#### Returns

`void`

---

### upload() \{#upload\}

```ts
upload(request): Promise<DevToolsPanelUploadResult>;
```

Defined in: [v2/panel-endpoint.ts:194](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L194)

Drives a `files.upload`.

#### Parameters

| Parameter | Type                                                          | Description                                 |
| --------- | ------------------------------------------------------------- | ------------------------------------------- |
| `request` | [`DevToolsPanelUploadRequest`](DevToolsPanelUploadRequest.md) | The params constructor and the byte source. |

#### Returns

`Promise`&lt;[`DevToolsPanelUploadResult`](../type-aliases/DevToolsPanelUploadResult.md)&gt;

A result that never rejects; for the success semantics see [DevToolsPanelUploadResult](../type-aliases/DevToolsPanelUploadResult.md).
