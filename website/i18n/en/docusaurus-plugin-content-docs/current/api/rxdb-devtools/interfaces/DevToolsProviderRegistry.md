# DevToolsProviderRegistry

Defined in: [v2/endpoint.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L59)

All the seams through which the endpoint accesses providers.

## Remarks

Only three members, and none carries a host concept: the endpoint does not know OPFS, SQLite or Rust commands — it only knows "get a provider by domain" and "open a sink for a transfer". The real host and the fake share the same shape here, which is why the conformance suite can run the same assertions against both.

## Extended by

- [`ConnectorProviderRegistry`](ConnectorProviderRegistry.md)

## Properties

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/endpoint.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L61)

The provider declarations existing in this session; the order is the order on the wire.

## Methods

### createChunkSink() \{#createchunksink\}

```ts
createChunkSink(name): DevToolsChunkSink;
```

Defined in: [v2/endpoint.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L71)

Opens a chunked disk receiver for one transfer; only a valid COMPLETE commits.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

[`DevToolsChunkSink`](DevToolsChunkSink.md)

---

### createChunkSource() \{#createchunksource\}

```ts
createChunkSource(requestId): DevToolsChunkSource | undefined;
```

Defined in: [v2/endpoint.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L87)

Opens a byte source for a successful `files.download`.

#### Parameters

| Parameter   | Type     | Description                                  |
| ----------- | -------- | -------------------------------------------- |
| `requestId` | `string` | The REQUEST ID that triggered this download. |

#### Returns

[`DevToolsChunkSource`](DevToolsChunkSource.md) \| `undefined`

The byte source to put on the wire, or `undefined`.

#### Remarks

`undefined` means **the bytes were already delivered on the source side** (browser OPFS saves the file from the page itself; see item 2 in the module header of `browser/opfs-files-provider.ts`), not "this provider does not support downloads" — the latter is already stated in the descriptor's `operations` and is rejected earlier at the authorization layer, so it never reaches this point. The shared null value makes "not wired" and "deliberately not streaming" look identical to the endpoint.

`requestId` is used as the key instead of minting a new ID: the only reliable way for the provider to recognize "the file I just agreed to download" is that call itself, and the transferId does not exist yet at this point (it is minted by the endpoint only after this method returns).

---

### provider() \{#provider\}

```ts
provider(domain): DevToolsProvider;
```

Defined in: [v2/endpoint.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L69)

Gets the provider of a domain.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `domain`  | `"database"` \| `"files"` \| `"settings"` |

#### Returns

[`DevToolsProvider`](DevToolsProvider.md)

#### Remarks

Does not return `undefined`: domain unavailability is answered by the provider itself with `provider_unavailable`, and a "absent domain" is rejected at the authorization layer with `provider_unsupported` — the two must not be merged into one null value.
