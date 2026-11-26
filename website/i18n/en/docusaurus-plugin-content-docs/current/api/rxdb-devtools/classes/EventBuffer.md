# EventBuffer

Defined in: [buffer.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L12)

Event buffer
Caches events while DevTools is disconnected, flushes after reconnect

FIFO policy: when the buffer is full, the oldest event is removed

## Constructors

### Constructor

```ts
new EventBuffer(maxSize?): EventBuffer;
```

Defined in: [buffer.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L36)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `maxSize?` | `number` | `DEFAULT_MAX_SIZE` |

#### Returns

`EventBuffer`

## Accessors

### isEmpty \{#isempty\}

#### Get Signature

```ts
get isEmpty(): boolean;
```

Defined in: [buffer.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L27)

Whether the buffer is empty

##### Returns

`boolean`

***

### isFull \{#isfull\}

#### Get Signature

```ts
get isFull(): boolean;
```

Defined in: [buffer.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L32)

Whether the buffer is full

##### Returns

`boolean`

***

### length \{#length\}

#### Get Signature

```ts
get length(): number;
```

Defined in: [buffer.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L17)

Current buffer size

##### Returns

`number`

***

### maxSize \{#maxsize\}

#### Get Signature

```ts
get maxSize(): number;
```

Defined in: [buffer.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L22)

Maximum buffer size

##### Returns

`number`

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [buffer.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L59)

Empties the buffer

#### Returns

`void`

***

### flush() \{#flush\}

```ts
flush(): SerializedEvent[];
```

Defined in: [buffer.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L52)

Empties and returns all buffered events

#### Returns

[`SerializedEvent`](../interfaces/SerializedEvent.md)[]

***

### push() \{#push\}

```ts
push(event): void;
```

Defined in: [buffer.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/buffer.ts#L44)

Adds an event to the buffer

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`SerializedEvent`](../interfaces/SerializedEvent.md) |

#### Returns

`void`
