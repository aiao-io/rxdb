# DevToolsNativeFilesProvider

Defined in: [native/native-files-provider.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L136)

The native `files` provider; adds a snapshot reclaim entry point on top of [DevToolsFilesProviderWithSource](DevToolsFilesProviderWithSource.md).

## Extends

- [`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md)

## Properties

### descriptor \{#descriptor\}

```ts
readonly descriptor: DevToolsProviderDescriptor;
```

Defined in: [provider/types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L174)

This provider's declaration; the second layer of the authorization matrix reads it directly.

#### Inherited from

[`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md).[`descriptor`](DevToolsFilesProviderWithSource.md#descriptor)

## Methods

### createChunkSink() \{#createchunksink\}

```ts
createChunkSink(transferId): DevToolsChunkSink;
```

Defined in: [native/native-files-provider.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L124)

Gets the disk receiver of a registered upload.

#### Parameters

| Parameter    | Type     | Description                                       |
| ------------ | -------- | ------------------------------------------------- |
| `transferId` | `string` | The transfer ID declared in the `upload` request. |

#### Returns

[`DevToolsChunkSink`](DevToolsChunkSink.md)

The sink of that transfer.

#### Throws

Throws when no upload has been registered for that ID — an ownerless sink would write a wiring mistake into a real file.

#### Inherited from

[`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md).[`createChunkSink`](DevToolsFilesProviderWithSource.md#createchunksink)

---

### createChunkSource() \{#createchunksource\}

```ts
createChunkSource(requestId): DevToolsChunkSource | undefined;
```

Defined in: [native/native-files-provider.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L132)

Gets the byte source of a registered download.

#### Parameters

| Parameter   | Type     | Description                       |
| ----------- | -------- | --------------------------------- |
| `requestId` | `string` | The ID of the `download` request. |

#### Returns

[`DevToolsChunkSource`](DevToolsChunkSource.md) \| `undefined`

The byte source of that download; `undefined` when no download has been registered for that ID.

#### Inherited from

[`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md).[`createChunkSource`](DevToolsFilesProviderWithSource.md#createchunksource)

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [native/native-files-provider.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L144)

Releases the diagnostic snapshot store and its timers.

#### Returns

`void`

#### Remarks

Idempotent. The snapshot store holds two timer paths — the 15 s deadline and the 60 s cursor idle — and both must be reclaimed when the session is torn down: the provider is assembled per session, so the store is a session-level resource too.

---

### invoke() \{#invoke\}

```ts
invoke(operation, params): Promise<DevToolsProviderResult>;
```

Defined in: [provider/types.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L188)

Executes an operation.

#### Parameters

| Parameter   | Type      | Description                                                                                                                                                                                                       |
| ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation` | `string`  | The authorized operation name.                                                                                                                                                                                    |
| `params`    | `unknown` | Parameters that have passed the wire layer's generic validation but have not been interpreted per operation; the implementation is responsible for domain-level validation (e.g. path validity → `invalid_path`). |

#### Returns

`Promise`&lt;[`DevToolsProviderResult`](../type-aliases/DevToolsProviderResult.md)&gt;

A successful result or an already-mapped error.

#### Remarks

The caller guarantees that `operation` has passed the three-layer authorization, so the implementation does **not** judge permissions again — two judgments would drift sooner or later, and the drift manifests as one of them quietly loosening.

#### Inherited from

[`DevToolsFilesProviderWithSource`](DevToolsFilesProviderWithSource.md).[`invoke`](DevToolsFilesProviderWithSource.md#invoke)
