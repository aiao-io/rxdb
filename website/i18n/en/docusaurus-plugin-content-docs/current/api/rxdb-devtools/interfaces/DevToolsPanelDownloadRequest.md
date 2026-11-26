# DevToolsPanelDownloadRequest

Defined in: [v2/panel-endpoint.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L109)

The input of a download call.

## Properties

### params \{#params\}

```ts
readonly params: (requestId) => unknown;
```

Defined in: [v2/panel-endpoint.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L120)

Constructs the `params` of the `files.download` request.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `requestId` | `string` |

#### Returns

`unknown`

#### Remarks

Structurally the same as [DevToolsPanelUploadRequest.params](DevToolsPanelUploadRequest.md#params), except that what is passed through here is the `requestId`: on the connector side `createChunkSource(requestId)` only receives that, and the provider's only chance to know which file to read is to get this same ID from the download request's params.

When it throws, `download()` rejects as-is and the registration is torn down as usual — the same as [DevToolsPanelUploadRequest.params](DevToolsPanelUploadRequest.md#params).

***

### sink \{#sink\}

```ts
readonly sink: DevToolsChunkSink;
```

Defined in: [v2/panel-endpoint.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L122)

The byte sink; it is `commit`ted only after a complete reception, and all other terminal states go through `discard`.
