# P2PTcpSocketLike

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L8)

Minimal event interface of a desktop TCP/TLS socket, adaptable from both Electron (Node `tls.TLSSocket`) and Tauri.

## Properties

### encrypted? \{#encrypted\}

```ts
readonly encrypted?: boolean;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L10)

true for a socket whose TLS handshake completed; plaintext sockets are rejected by default.

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L14)

Closes the connection immediately and releases the underlying resources.

#### Returns

`void`

***

### off() \{#off\}

#### Call Signature

```ts
off(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L20)

Unsubscribes from socket events.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"data"` |
| `listener` | (`chunk`) => `void` |

##### Returns

`void`

#### Call Signature

```ts
off(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L21)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"error"` |
| `listener` | (`error`) => `void` |

##### Returns

`void`

#### Call Signature

```ts
off(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L22)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"close"` \| `"drain"` |
| `listener` | () => `void` |

##### Returns

`void`

***

### on() \{#on\}

#### Call Signature

```ts
on(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L16)

Subscribes to socket events: `data` carries bytes, `error` carries an error, `close` / `drain` carry no arguments.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"data"` |
| `listener` | (`chunk`) => `void` |

##### Returns

`void`

#### Call Signature

```ts
on(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L17)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"error"` |
| `listener` | (`error`) => `void` |

##### Returns

`void`

#### Call Signature

```ts
on(event, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L18)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"close"` \| `"drain"` |
| `listener` | () => `void` |

##### Returns

`void`

***

### write() \{#write\}

```ts
write(data): boolean | void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/tcp-transport.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/tcp-transport.ts#L12)

Writes a byte span; returning false means the write buffer is full and writing must wait for `drain`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `Uint8Array` |

#### Returns

`boolean` \| `void`
