# DevToolsConnector

Defined in: [connector.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L131)

RxDB DevTools connector.

The current protocol supports a single RxDB instance; re-initializing with the same instance is idempotent.

## Constructors

### Constructor

```ts
new DevToolsConnector(options?): DevToolsConnector;
```

Defined in: [connector.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L201)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`DevToolsOptions`](../interfaces/DevToolsOptions.md) | Connector configuration; for defaults see the `@defaultValue` of each [DevToolsOptions](../interfaces/DevToolsOptions.md) member |

#### Returns

`DevToolsConnector`

#### Throws

RangeError when `options.maxBufferSize` is not a positive safe integer (thrown by `EventBuffer`)

## Accessors

### capabilities \{#capabilities\}

#### Get Signature

```ts
get capabilities(): DevToolsCapability;
```

Defined in: [connector.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L193)

The command capability tier granted to DevTools by this page.

##### Remarks

For semantics see [DevToolsCapability](../type-aliases/DevToolsCapability.md); it is announced to DevTools together with the payload during the handshake.

##### Returns

[`DevToolsCapability`](../type-aliases/DevToolsCapability.md)

***

### connected \{#connected\}

#### Get Signature

```ts
get connected(): boolean;
```

Defined in: [connector.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L172)

Whether DevTools has confirmed the handshake.

##### Remarks

When `false`, events go into the buffer instead of onto the message bus; once `HANDSHAKE_ACK` is received,
the buffer is flushed all at once. Both [disconnect](#disconnect) and the `DISCONNECT` command set it back to `false`.

##### Returns

`boolean`

***

### enabled \{#enabled\}

#### Get Signature

```ts
get enabled(): boolean;
```

Defined in: [connector.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L183)

Whether the connector is enabled.

##### Remarks

Decided at construction by [DevToolsOptions.enabled](../interfaces/DevToolsOptions.md#enabled); under an opaque origin, when
[DevToolsOptions.allowOpaqueOrigin](../interfaces/DevToolsOptions.md#allowopaqueorigin) is not explicitly enabled, [init](#init) demotes it to `false`.

##### Returns

`boolean`

## Methods

### disconnect() \{#disconnect\}

```ts
disconnect(): void;
```

Defined in: [connector.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L270)

Disconnects the connector channel and cleans up local listeners.

#### Returns

`void`

#### Remarks

**Does not** call `RxDB.disconnectAll()` — that is the responsibility of the `DISCONNECT_RXDB` command.
This method only reverses the side effects of [init](#init): sends a `DISCONNECT`, removes the message listener and
all event listeners, cancels in-flight query subscriptions, deletes the global helper, empties the buffer, and resets the sequence to zero.
After the call, [init](#init) can be invoked again (the sequence restarts from 0, forming a new session).

`DISCONNECT` is sent **before** the port closes, and deliberately over the current channel (the private port if still shaken hands) —
closing the port first would drop this farewell message into a closed channel, and the peer could only wait for a timeout.

***

### init() \{#init\}

```ts
init(
   rxdb, 
   getEntityMetadata?, 
   options?
): void;
```

Defined in: [connector.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector.ts#L228)

Initializes the connector and registers the sole RxDB instance.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`DevToolsRxDB`](../type-aliases/DevToolsRxDB.md) | The RxDB instance to observe; the `RxDB` of `@aiao/rxdb` can be passed directly, no assertion needed |
| `getEntityMetadata?` | [`GetEntityMetadataFn`](../type-aliases/GetEntityMetadataFn.md) | Entity metadata reader function (usually `getEntityMetadata` from `@aiao/rxdb`). When omitted the connector knows no entities: `INSPECT_DB` returns `null`, `QUERY_ENTITY` returns "entity not found", and **encrypted fields are not masked** (there is no way to know which fields are ciphertext) |
| `options?` | `Pick`&lt;[`DevToolsOptions`](../interfaces/DevToolsOptions.md), `"i18n"` \| `"mutationPolicy"`&gt; | Can supplement the i18n port and write policy at runtime after construction; changing them rebuilds the debug session. |

#### Returns

`void`

#### Throws

Error when another RxDB instance is already registered; repeated calls with the same instance are idempotent

#### Throws

Passed through from `getEntityMetadata` — the upstream `getEntityMetadata` fail-fast on undecorated classes

#### Remarks

When `enabled === false` or in a non-browser environment (`window === undefined`), returns immediately
without registering any listeners. Under an opaque origin without [DevToolsOptions.allowOpaqueOrigin](../interfaces/DevToolsOptions.md#allowopaqueorigin),
logs a warning once and demotes the connector to disabled — see [DevToolsOptions.allowOpaqueOrigin](../interfaces/DevToolsOptions.md#allowopaqueorigin) for details.

Side effects: registers the `window` message listener, subscribes to all [RXDB\_EVENT\_TYPES](../variables/RXDB_EVENT_TYPES.md) events,
mounts the disconnect helper on `window.__AIAO_RXDB_DEVTOOLS__`, and immediately sends one handshake.
All of it is reversed by [disconnect](#disconnect).
