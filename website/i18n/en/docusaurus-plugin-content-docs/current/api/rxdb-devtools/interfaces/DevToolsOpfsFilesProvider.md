# DevToolsOpfsFilesProvider

Defined in: [browser/opfs-files-provider.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L76)

The OPFS `files` provider; additionally exposes a sink factory bound to the transferId.

## Extends

- [`DevToolsProvider`](DevToolsProvider.md)

## Properties

### descriptor \{#descriptor\}

```ts
readonly descriptor: DevToolsProviderDescriptor;
```

Defined in: [provider/types.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L174)

This provider's declaration; the second layer of the authorization matrix reads it directly.

#### Inherited from

[`DevToolsProvider`](DevToolsProvider.md).[`descriptor`](DevToolsProvider.md#descriptor)

## Methods

### createChunkSink() \{#createchunksink\}

```ts
createChunkSink(transferId): DevToolsChunkSink;
```

Defined in: [browser/opfs-files-provider.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L84)

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

[`DevToolsProvider`](DevToolsProvider.md).[`invoke`](DevToolsProvider.md#invoke)
