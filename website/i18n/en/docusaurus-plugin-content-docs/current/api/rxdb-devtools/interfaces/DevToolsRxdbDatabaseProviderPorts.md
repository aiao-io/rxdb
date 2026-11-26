# DevToolsRxdbDatabaseProviderPorts

Defined in: [rxdb/database-provider.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L58)

The construction ports of the `database` provider.

## Properties

### canClearI18nMissing? \{#cancleari18nmissing\}

```ts
readonly canClearI18nMissing?: boolean;
```

Defined in: [rxdb/database-provider.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L92)

The current session indeed allows clearing the diagnostics.

***

### getEntityMetadata \{#getentitymetadata\}

```ts
getEntityMetadata: GetEntityMetadataFn;
```

Defined in: [rxdb/database-provider.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L77)

The entity metadata reading function; exceptions pass through with upstream semantics (not masking equals leaking plaintext).

***

### i18n? \{#i18n\}

```ts
readonly i18n?: DevToolsI18nPort;
```

Defined in: [rxdb/database-provider.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L90)

The i18n runtime explicitly provided by the application.

***

### runtime \{#runtime\}

```ts
readonly runtime: "browser" | "electron" | "tauri";
```

Defined in: [rxdb/database-provider.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L80)

Used only for descriptor display.

## Methods

### emitEvent() \{#emitevent\}

```ts
emitEvent(eventType, data): void;
```

Defined in: [rxdb/database-provider.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L88)

Pushes an already-masked, already-serialized RxDB event to the peer.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `eventType` | `string` | A key of `RxDBEventMap`. |
| `data` | `unknown` | The event payload; the caller no longer holds it. |

#### Returns

`void`

***

### getRxDB() \{#getrxdb\}

```ts
getRxDB(): DevToolsRxDB | undefined;
```

Defined in: [rxdb/database-provider.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L74)

Gets the current RxDB instance.

#### Returns

[`DevToolsRxDB`](../type-aliases/DevToolsRxDB.md) \| `undefined`

#### Remarks

Returning `undefined` means not initialized yet: all operations answer `provider_unavailable` (retryable), rather than an empty result — an empty result would make the panel display "not connected yet" as "this database is empty".

The instance can be swapped at runtime (including back to `undefined`), and the entity index and event subscriptions are rebuilt accordingly. Swapping has no notification: the provider re-reads it at every operation entry and every event forwarding boundary, and upon detecting a swap it invalidates the entity index and removes all listeners on the old instance; when events were enabled (an `events` call happened and no `dispose()` followed), the subscription is rebuilt on the current instance immediately. Events emitted by the old instance after the swap are never forwarded. Between the swap and the next operation (or the next event of the old instance), no one is subscribed to the new instance's events — a host that needs to pick them up immediately should call any operation once after swapping. The same instance must be returned as-is by identity: wrapping it in a new object each time would be treated as constantly swapping instances.
