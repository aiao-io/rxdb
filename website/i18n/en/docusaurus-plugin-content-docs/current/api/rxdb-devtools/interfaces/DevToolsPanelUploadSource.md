# DevToolsPanelUploadSource

Defined in: [v2/panel-endpoint.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L77)

The source of bytes for an upload.

## Properties

### totalBytes \{#totalbytes\}

```ts
readonly totalBytes: number;
```

Defined in: [v2/panel-endpoint.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L79)

The total byte count; used for the `totalBytes` of `TRANSFER_START` and the limit pre-check.

## Methods

### read() \{#read\}

```ts
read(offset, length): Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [v2/panel-endpoint.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L88)

Reads `[offset, offset + length)`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `offset` | `number` | The starting offset, equal to the number of bytes already sent. |
| `length` | `number` | The number of bytes needed, always ≤ 256 KiB. |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

Exactly `length` bytes; a length mismatch is treated as a source implementation error, and this upload ends with `operation_failed` and emits `TRANSFER_CANCEL`.
