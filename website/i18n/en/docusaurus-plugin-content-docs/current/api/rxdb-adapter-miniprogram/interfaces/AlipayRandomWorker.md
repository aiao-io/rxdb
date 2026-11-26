# AlipayRandomWorker

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L45)

The Worker returned by `my.createWorker('workers/index.js', { useExperimentalWorker: true })`; messages are plain objects.

The Worker script uses the package's `@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js`.

## Methods

### onMessage() \{#onmessage\}

```ts
onMessage(listener): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L47)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`message`) => `void` |

#### Returns

`void`

***

### postMessage() \{#postmessage\}

```ts
postMessage(message): void;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/hosts/alipay-api.ts#L46)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `object` |

#### Returns

`void`
