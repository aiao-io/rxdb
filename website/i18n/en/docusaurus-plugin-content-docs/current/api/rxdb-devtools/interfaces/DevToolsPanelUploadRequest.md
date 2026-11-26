# DevToolsPanelUploadRequest

Defined in: [v2/panel-endpoint.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L126)

Arguments of a single upload call.

## Properties

### params \{#params\}

```ts
readonly params: (transferId) => unknown;
```

Defined in: [v2/panel-endpoint.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L138)

Constructs the `params` of the `files.upload` request.

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `transferId` | `string` |

#### Returns

`unknown`

#### Remarks

Is a **function** rather than an object: the connector-side `createChunkSink(transferId)` only
receives a transferId, and the provider's only chance to learn which path the bytes should land
at is to read that same transferId from the upload request's params. Letting the caller assemble
it is better than this module stuffing keys into the caller's object.

When it throws, `upload()` rejects with it unchanged — that is the caller's wiring error, not
disguised as a protocol error; the registration and timers for this upload are torn down as
usual and no frames are emitted.

---

### source \{#source\}

```ts
readonly source: DevToolsPanelUploadSource;
```

Defined in: [v2/panel-endpoint.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L140)

The byte source.
