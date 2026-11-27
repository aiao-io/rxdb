# DevToolsFilesProviderWithSource

Defined in: [native/native-files-provider.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L116)

A `files` provider that has both an outbound byte source and an inbound write-to-disk port.

## Extends

- [`DevToolsProvider`](DevToolsProvider.md)

## Extended by

- [`DevToolsNativeFilesProvider`](DevToolsNativeFilesProvider.md)

## Properties

### descriptor \{#descriptor\}

```ts
readonly descriptor: DevToolsProviderDescriptor;
```

Defined in: [provider/types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L174)

This provider's descriptor; the second layer of the authorization matrix reads it directly.

#### Inherited from

[`DevToolsProvider`](DevToolsProvider.md).[`descriptor`](DevToolsProvider.md#descriptor)

## Methods

### createChunkSink() \{#createchunksink\}

```ts
createChunkSink(transferId): DevToolsChunkSink;
```

Defined in: [native/native-files-provider.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L124)

Fetches the disk sink of a registered upload.

#### Parameters

| Parameter    | Type     | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `transferId` | `string` | The transfer ID declared in the `upload` request. |

#### Returns

[`DevToolsChunkSink`](DevToolsChunkSink.md)

The sink of that transfer.

#### Throws

Thrown when no upload is registered under that ID — an ownerless sink would turn a wiring
error into a real file.

---

### createChunkSource() \{#createchunksource\}

```ts
createChunkSource(requestId): DevToolsChunkSource | undefined;
```

Defined in: [native/native-files-provider.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L132)

Fetches the byte source of a registered download.

#### Parameters

| Parameter   | Type     | Description                       |
| ----------- | -------- | --------------------------------- |
| `requestId` | `string` | The ID of the `download` request. |

#### Returns

[`DevToolsChunkSource`](DevToolsChunkSource.md) \| `undefined`

The byte source of that download; `undefined` when no download is registered under that ID.

---

### invoke() \{#invoke\}

```ts
invoke(operation, params): Promise<DevToolsProviderResult>;
```

Defined in: [provider/types.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L188)

Executes an operation.

#### Parameters

| Parameter   | Type      | Description                                                                                                                                                                                                   |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation` | `string`  | The authorized operation name.                                                                                                                                                                                |
| `params`    | `unknown` | Parameters that have passed the generic wire-layer validation but are not yet interpreted per operation; the implementation is responsible for domain-level validation (e.g. path validity → `invalid_path`). |

#### Returns

`Promise`&lt;[`DevToolsProviderResult`](../type-aliases/DevToolsProviderResult.md)&gt;

A successful result or a mapped error.

#### Remarks

The caller guarantees that `operation` has passed the three layers of authorization, so the
implementation must **not** judge permissions again — two separate checks would drift sooner
or later, and drift shows up as one of them silently relaxing.

#### Inherited from

[`DevToolsProvider`](DevToolsProvider.md).[`invoke`](DevToolsProvider.md#invoke)
