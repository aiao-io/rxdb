# P2PDataChannelLike

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L11)

The minimal interface of a browser `RTCDataChannel`.

## Properties

### binaryType \{#binarytype\}

```ts
binaryType: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L15)

The adapter sets this to `arraybuffer`.

***

### bufferedAmount \{#bufferedamount\}

```ts
readonly bufferedAmount: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L17)

Bytes queued but not yet sent.

***

### bufferedAmountLowThreshold \{#bufferedamountlowthreshold\}

```ts
bufferedAmountLowThreshold: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L19)

The threshold that triggers the `bufferedamountlow` event; the adapter sets it.

***

### readyState \{#readystate\}

```ts
readonly readyState: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L13)

Channel state: `connecting` / `open` / `closing` / `closed`.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L25)

Subscribes to channel events.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`P2PDataChannelEvent`](../type-aliases/P2PDataChannelEvent.md) |
| `listener` | (`event`) => `void` |

#### Returns

`void`

***

### close() \{#close\}

```ts
close(): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L23)

Closes the channel.

#### Returns

`void`

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(type, listener): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L27)

Unsubscribes from channel events.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`P2PDataChannelEvent`](../type-aliases/P2PDataChannelEvent.md) |
| `listener` | (`event`) => `void` |

#### Returns

`void`

***

### send() \{#send\}

```ts
send(data): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/webrtc-transport.ts#L21)

Sends a binary message.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `ArrayBuffer` \| `ArrayBufferView`&lt;`ArrayBufferLike`&gt; |

#### Returns

`void`
