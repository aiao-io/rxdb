# ConnectorProviderRegistry

Defined in: [connector-providers.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L157)

The registry assembled in-page.

## Remarks

Has one [dispose](#dispose) more than [DevToolsProviderRegistry](DevToolsProviderRegistry.md):
the `database` provider attaches 25 event listeners on the RxDB instance, and if only the
endpoint were torn down without the subscriptions, a replaced instance could never be collected
because the listeners are still attached.

## Extends

- [`DevToolsProviderRegistry`](DevToolsProviderRegistry.md)

## Properties

### descriptors \{#descriptors\}

```ts
readonly descriptors: readonly DevToolsProviderDescriptor[];
```

Defined in: [v2/endpoint.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L61)

The descriptors of providers present in this session; their order is the order on the wire.

#### Inherited from

[`DevToolsProviderRegistry`](DevToolsProviderRegistry.md).[`descriptors`](DevToolsProviderRegistry.md#descriptors)

## Methods

### createChunkSink() \{#createchunksink\}

```ts
createChunkSink(name): DevToolsChunkSink;
```

Defined in: [v2/endpoint.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L71)

Opens a chunked disk sink for one transfer; only a legal COMPLETE commits it.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `name`    | `string` |

#### Returns

[`DevToolsChunkSink`](DevToolsChunkSink.md)

#### Inherited from

[`DevToolsProviderRegistry`](DevToolsProviderRegistry.md).[`createChunkSink`](DevToolsProviderRegistry.md#createchunksink)

---

### createChunkSource() \{#createchunksource\}

```ts
createChunkSource(requestId): DevToolsChunkSource | undefined;
```

Defined in: [v2/endpoint.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L87)

Opens a byte source for one successful `files.download`.

#### Parameters

| Parameter   | Type     | Description                                  |
| ----------- | -------- | -------------------------------------------- |
| `requestId` | `string` | The REQUEST ID that triggered this download. |

#### Returns

[`DevToolsChunkSource`](DevToolsChunkSource.md) \| `undefined`

The byte source to put on the wire, or `undefined`.

#### Remarks

Returning `undefined` means the **bytes were already delivered at the source side** (in the
browser, OPFS is saved by the page itself; see item 2 of the module header of
`browser/opfs-files-provider.ts`), not that "this provider does not support download" — the
latter is already stated in the descriptor's `operations`, where the authorization layer stops
it first, so it never gets to express itself here. Sharing one null value between the two makes
"not wired" and "deliberately not streaming" look identical at the endpoint.

Using `requestId` rather than minting another ID as the key: the only reliable basis for the
provider to recognize "the file I just agreed to download" is that call itself, and the
transferId does not exist yet at this moment (the endpoint mints it only after this method
returns).

#### Inherited from

[`DevToolsProviderRegistry`](DevToolsProviderRegistry.md).[`createChunkSource`](DevToolsProviderRegistry.md#createchunksource)

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [connector-providers.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L159)

Releases all subscriptions held by this assembly; idempotent.

#### Returns

`void`

---

### provider() \{#provider\}

```ts
provider(domain): DevToolsProvider;
```

Defined in: [v2/endpoint.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L69)

Fetches the provider of a domain.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `domain`  | `"database"` \| `"files"` \| `"settings"` |

#### Returns

[`DevToolsProvider`](DevToolsProvider.md)

#### Remarks

Does not return `undefined`: an unavailable domain is answered by the provider itself with
`provider_unavailable`, while an absent domain is stopped at the authorization layer with
`provider_unsupported` — the two cannot be merged into one null value.

#### Inherited from

[`DevToolsProviderRegistry`](DevToolsProviderRegistry.md).[`provider`](DevToolsProviderRegistry.md#provider)
