# rxdb-devtools

Development-time connector between RxDB and the browser DevTools Extension. It sends events, database summaries, entity query results, and branch operation results through the current page's `window.postMessage`.

## Enable only in development

This package exposes database inspection, querying, branch mutation, and disconnect capabilities, and must not be initialized in production builds.

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const { getDevToolsConnector } = await import('@aiao/rxdb-devtools');
  getDevToolsConnector().init(rxdb, getEntityMetadata);
}
```

The caller is responsible for ensuring the production bundle never executes `init()`. `enabled: false` can be used for testing or explicit opt-out, but it is not a substitute for the build-time development gate.

## Lifecycle

- `getDevToolsConnector()` returns the page-level connector singleton.
- `init(rxdb, getEntityMetadata)` registers the RxDB instance, reads entity metadata, subscribes to RxDB events, and sends `HANDSHAKE`.
- Once DevTools responds with `HANDSHAKE_ACK`, the connector sends live events and flushes the in-memory event buffer accumulated before the handshake.
- Calling `init()` repeatedly with the same RxDB object is idempotent; it will not re-handshake, re-read metadata, or re-register listeners.
- The third argument of `init()` can explicitly supply `i18n` and `mutationPolicy`; for the same instance, the previous session is only torn down and re-handshaken when the options actually change.
- The current protocol explicitly supports a single RxDB instance. A second, different instance throws before its metadata is read, mappings are modified, or listeners are registered.
- `disconnect()` only disconnects the connector channel, cleans up listeners and the buffer; it does not call `rxdb.disconnectAll()`.
- `DISCONNECT_RXDB` or `window.__AIAO_RXDB_DEVTOOLS__.disconnectRxdb()` requests that RxDB be shut down:
  - `graceful`: `disconnectAll()` succeeds, then the instance and listeners are cleaned up;
  - `forced`: graceful fails, but the local Worker terminates or the SharedWorker port closes successfully, then cleanup follows;
  - `failed`: shutdown, timeout, or forced release fails; the instance, listeners, and global helper are kept so a retry is possible;
  - `not-connected`: no instance is currently registered.

## SSR

`init()` and `disconnect()` are no-ops in environments without `window`. It is still recommended to keep the dynamic import and initialization inside a browser development branch to avoid pointless server-side loading.

## Internationalization inspection

The application passes its existing `I18n` instance in as a structural port; the connector neither creates an i18n singleton nor depends on `@aiao/rxdb-i18n`:

```ts
getDevToolsConnector().init(rxdb, getEntityMetadata, {
  i18n,
  mutationPolicy: 'allow'
});
```

The panel's I18n page shows the current language, the copy and source of each catalog level, the highest-priority version, missing keys, and the first observation time. The optional `i18n` field of `database.inspect` carries the snapshot; subsequent changes are pushed through the existing `database.events` channel via `I18N_CHANGED`. When no port is injected, the original response gains no extra fields, and the existing wire domain, operation names, and handshake structure stay compatible.

The clear button appears only when `canClearMissing: true`, which requires the `full` capability tier, `mutationPolicy: 'allow'`, an available settings provider, and an explicit clear port. The request travels along the existing `settings.clear` with the exact parameter `{ scope: 'i18n-missing' }` and deletes only i18n diagnostics. Unknown scopes are rejected; legacy requests without a scope keep delegating to the original provider, and providers that never supported full clears still return their original rejection result. When a legacy connector lacks the `i18n` field, the new panel does not issue diagnostic clear requests.

## Communication and threat model

The connector only accepts:

- `event.source === window`;
- `event.origin` empty or equal to the current page origin;
- a message envelope that is complete and has no extra fields;
- known message types, legal directions, and matching command payloads.

These checks reject malformed messages; they are **not authentication**. Any script that can execute JavaScript on the same page can construct a perfectly legal `window.postMessage` command. Putting a token into the same observable, replayable `postMessage` channel would only create an illusion of security, so this package implements no such token.

A truly trustworthy capability requires the Extension to establish, across an isolation boundary, a channel that page scripts cannot forge; that involves an out-of-package Extension protocol and is not implemented yet. Until then, treat this package as a development tool and third-party scripts on the page as equally trusted.

### Dangerous commands

- `DISCONNECT_RXDB`: shuts down the current RxDB instance;
- `QUERY_ENTITY`: reads the specified entity; `limit` may only be omitted or a safe integer in `1..1000`;
- `SWITCH_BRANCH`: switches branches;
- `CREATE_BRANCH`: creates a branch;
- `DELETE_BRANCH`: deletes a branch.

Malformed envelopes or payloads are silently rejected; they never reach the command handler, and an illegal `limit` is never silently replaced with a default.

## Encrypted field policy

The `encryptedPropertyMap` returned by `getEntityMetadata` is the single source of encrypted fields. The connector builds the field mapping at initialization and enforces the following rules:

- In `QUERY_ENTITY` results, top-level fields declared by metadata are always replaced with `[encrypted]`;
- `entities[].patch`, `entities[].inversePatch`, and `entities[].data` in events use the same masking rules;
- non-sensitive fields stay unchanged;
- only top-level field names are interpreted; nested paths like `profile.ssn` are not parsed, and same-named fields inside nested objects are not recursively replaced;
- there is no plaintext opt-in; DevTools can never request plaintext of metadata-declared fields through this protocol;
- the serializer still masks strings matching the known encrypted envelope format.

If metadata misses a field, the connector cannot guess its sensitivity. The correctness of entity metadata is an upstream security contract.

## bigint / binary wire representation

`QUERY_ENTITY`, `EVENT`, history/change, conflict, and branch responses share the read-only serializer. This representation only serves DevTools communication and display; it is not used for entity write-back or change persistence:

```ts
type DevToolsBigIntValue = { $rxdb: 1; type: 'bigint'; value: string };
type DevToolsBinaryValue = {
  $rxdb: 1;
  type: 'binary';
  encoding: 'base64url';
  value: string;
  byteLength: number;
};
```

- bigint uses an exact decimal string;
- binary copies the current `Uint8Array` view and encodes it as base64url without padding;
- the serializer never mutates the entity, patch, or input bytes;
- metadata-declared encrypted fields are replaced with `[encrypted]` before entering the serializer, so neither plaintext nor binary length leaks;
- the panel only recognizes legal, known envelopes with `$rxdb: 1`; other versions display `unsupported` and are never guessed at.

## Fileoverview

RxDB DevTools integration package — the page-side connector and the `window.postMessage` wire protocol.

## Remarks

The entry point exports the **complete surface of the protocol**: the connector + message types + type guards + message factories.
The DevTools extension and this package share this single definition; if either side re-declares the protocol shape on its own, version drift causes
silent mismatches (one side adds a field and the other side's guard rejects the whole message without an error).
Therefore, when adding a new message type, `types.ts` and this file must be updated together.

## Classes

| Class | Description |
| ------ | ------ |
| [DevToolsConnector](classes/DevToolsConnector.md) | RxDB DevTools connector. |
| [EventBuffer](classes/EventBuffer.md) | Event buffer. Caches events while DevTools is disconnected, flushes after reconnect |
| [SequenceGenerator](classes/SequenceGenerator.md) | Sequence number generator class. Generates monotonically increasing sequence numbers for event ordering |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [BranchesMessage](interfaces/BranchesMessage.md) | Branch list response. |
| [ClearMessage](interfaces/ClearMessage.md) | Message that clears DevTools events. |
| [ConnectorDatabasePorts](interfaces/ConnectorDatabasePorts.md) | Ports for the `database` domain; **all three are required**. |
| [ConnectorProviderPorts](interfaces/ConnectorProviderPorts.md) | Inputs for assembling the in-page provider seams. |
| [ConnectorProviderRegistry](interfaces/ConnectorProviderRegistry.md) | The registry assembled inside the page. |
| [CreateBranchMessage](interfaces/CreateBranchMessage.md) | Create-branch command. |
| [DbInfoEntity](interfaces/DbInfoEntity.md) | Summary of a single entity in `DB_INFO`. |
| [DbInfoMessage](interfaces/DbInfoMessage.md) | Database info response. |
| [DbInfoPayload](interfaces/DbInfoPayload.md) | Database info response payload. |
| [DbModelInfoEntity](interfaces/DbModelInfoEntity.md) | Model of a single entity in `DB_MODEL_INFO`. |
| [DbModelInfoMessage](interfaces/DbModelInfoMessage.md) | Database model info response; legacy panels ignore unknown message types. |
| [DbModelInfoPayload](interfaces/DbModelInfoPayload.md) | Database model info response payload. |
| [DeleteBranchMessage](interfaces/DeleteBranchMessage.md) | Delete-branch command. |
| [DevToolsAuthorizationInput](interfaces/DevToolsAuthorizationInput.md) | Input for authorizing one operation; all three settings come from local state, while `domain` / `operation` come from the wire. |
| [DevToolsBigIntValue](interfaces/DevToolsBigIntValue.md) | Exact bigint representation for the DevTools wire protocol only. |
| [DevToolsBinaryValue](interfaces/DevToolsBinaryValue.md) | Binary representation for the DevTools wire protocol only. |
| [DevToolsChunkSink](interfaces/DevToolsChunkSink.md) | Byte sink for chunked transfers. |
| [DevToolsChunkSource](interfaces/DevToolsChunkSource.md) | Byte source for chunked transfers; the inverse of [DevToolsChunkSink](interfaces/DevToolsChunkSink.md). |
| [DevToolsClock](interfaces/DevToolsClock.md) | Protocol clock port. |
| [DevToolsConnectorEndpoint](interfaces/DevToolsConnectorEndpoint.md) | Connector-side v2 endpoint. |
| [DevToolsConnectorEndpointPorts](interfaces/DevToolsConnectorEndpointPorts.md) | Construction ports for the endpoint. |
| [DevToolsConnectorNegotiation](interfaces/DevToolsConnectorNegotiation.md) | Connector negotiation state machine. |
| [DevToolsConnectorNegotiationPorts](interfaces/DevToolsConnectorNegotiationPorts.md) | Construction ports for the connector negotiation state machine. |
| [DevToolsConnectorTransport](interfaces/DevToolsConnectorTransport.md) | Minimal abstraction over the connector transport layer. |
| [DevToolsEntityField](interfaces/DevToolsEntityField.md) | A single model field passed to DevTools; contains no default values, validators, functions, or constraints. |
| [DevToolsEntityFieldOption](interfaces/DevToolsEntityFieldOption.md) | Safe display option for an enum value. |
| [DevToolsEntityMetadata](interfaces/DevToolsEntityMetadata.md) | The subset of entity metadata that DevTools actually reads. |
| [DevToolsEntityModel](interfaces/DevToolsEntityModel.md) | Safe projection of an entity model passed to DevTools. |
| [DevToolsErrorFramePayload](interfaces/DevToolsErrorFramePayload.md) | `ERROR` payload; `requestId: null` indicates a session-level error with no corresponding request. |
| [DevToolsErrorOptions](interfaces/DevToolsErrorOptions.md) | Options when creating an error envelope. |
| [DevToolsErrorPayload](interfaces/DevToolsErrorPayload.md) | Outward error envelope. |
| [DevToolsEventPayload](interfaces/DevToolsEventPayload.md) | `EVENT` payload. |
| [DevToolsFilesProviderWithSource](interfaces/DevToolsFilesProviderWithSource.md) | A `files` provider that has both an outbound byte source and an inbound write-to-disk port. |
| [DevToolsHandshakeCapabilities](interfaces/DevToolsHandshakeCapabilities.md) | The capability surface the connector announces in HANDSHAKE. |
| [DevToolsI18nMessage](interfaces/DevToolsI18nMessage.md) | One inspectable catalog message. |
| [DevToolsI18nMissingMessage](interfaces/DevToolsI18nMissingMessage.md) | Wire shape of a missing-copy diagnostic. |
| [DevToolsI18nPort](interfaces/DevToolsI18nPort.md) | A structural port explicitly injected by the application, so DevTools needs no dependency on any i18n implementation package. |
| [DevToolsI18nSnapshot](interfaces/DevToolsI18nSnapshot.md) | Optional internationalization snapshot of database.inspect. |
| [DevToolsInvalidDateValue](interfaces/DevToolsInvalidDateValue.md) | Invalid Date representation for the DevTools wire protocol only. |
| [DevToolsMessage](interfaces/DevToolsMessage.md) | Base message structure. |
| [DevToolsNativeEntry](interfaces/DevToolsNativeEntry.md) | A single native directory entry. |
| [DevToolsNativeFilesProvider](interfaces/DevToolsNativeFilesProvider.md) | Native `files` provider; adds a snapshot reclaim entry point on top of [DevToolsFilesProviderWithSource](interfaces/DevToolsFilesProviderWithSource.md). |
| [DevToolsNativeFilesProviderPorts](interfaces/DevToolsNativeFilesProviderPorts.md) | Construction ports for the native `files` provider. |
| [DevToolsNativeFilesystem](interfaces/DevToolsNativeFilesystem.md) | The minimal file capabilities the host must provide to the provider. |
| [DevToolsNativeSnapshotPorts](interfaces/DevToolsNativeSnapshotPorts.md) | Construction ports for the native snapshot source. |
| [DevToolsOpfsFilesProvider](interfaces/DevToolsOpfsFilesProvider.md) | OPFS `files` provider; additionally exposes a sink factory bound to a transferId. |
| [DevToolsOpfsFilesProviderPorts](interfaces/DevToolsOpfsFilesProviderPorts.md) | Construction ports for the OPFS provider. |
| [DevToolsOptions](interfaces/DevToolsOptions.md) | RxDB DevTools configuration options. |
| [DevToolsPanelDownloadRequest](interfaces/DevToolsPanelDownloadRequest.md) | Input of a single download call. |
| [DevToolsPanelEndpoint](interfaces/DevToolsPanelEndpoint.md) | Panel data-plane client. |
| [DevToolsPanelEndpointPorts](interfaces/DevToolsPanelEndpointPorts.md) | Construction ports for the panel data-plane client. |
| [DevToolsPanelNegotiation](interfaces/DevToolsPanelNegotiation.md) | Panel negotiation state machine. |
| [DevToolsPanelNegotiationPorts](interfaces/DevToolsPanelNegotiationPorts.md) | Construction ports for the panel negotiation state machine. |
| [DevToolsPanelUploadRequest](interfaces/DevToolsPanelUploadRequest.md) | Input of a single upload call. |
| [DevToolsPanelUploadSource](interfaces/DevToolsPanelUploadSource.md) | Byte source of an upload. |
| [DevToolsProtocolHelloPayload](interfaces/DevToolsProtocolHelloPayload.md) | `PROTOCOL_HELLO` payload. |
| [DevToolsProvider](interfaces/DevToolsProvider.md) | A provider implementation for one domain. |
| [DevToolsProviderDescriptor](interfaces/DevToolsProviderDescriptor.md) | Provider descriptor; at most one per domain. |
| [DevToolsProviderLimits](interfaces/DevToolsProviderLimits.md) | Resource limits declared by a provider. |
| [DevToolsProviderOptions](interfaces/DevToolsProviderOptions.md) | The part of in-page provider assembly that the host must inject explicitly. |
| [DevToolsProviderRegistry](interfaces/DevToolsProviderRegistry.md) | All the seams through which the endpoint accesses providers. |
| [DevToolsRequestPayload](interfaces/DevToolsRequestPayload.md) | `REQUEST` payload; the domain shape of `params` is validated by the provider layer, the wire layer only guarantees the key exists. |
| [DevToolsResponsePayload](interfaces/DevToolsResponsePayload.md) | `RESPONSE` payload. |
| [DevToolsRxdbDatabaseProvider](interfaces/DevToolsRxdbDatabaseProvider.md) | `database` provider; additionally exposes a subscription reclaim entry point. |
| [DevToolsRxdbDatabaseProviderPorts](interfaces/DevToolsRxdbDatabaseProviderPorts.md) | Construction ports for the `database` provider. |
| [DevToolsSnapshotCursor](interfaces/DevToolsSnapshotCursor.md) | Pagination cursor; of the three binding conditions (session, snapshot, page boundary) it carries the latter two. |
| [DevToolsSnapshotEntry](interfaces/DevToolsSnapshotEntry.md) | A single raw snapshot entry; `side` is determined by the port that reads it, not declared by the entry itself. |
| [DevToolsSnapshotLock](interfaces/DevToolsSnapshotLock.md) | Global exclusive lock over storage. |
| [DevToolsSnapshotPage](interfaces/DevToolsSnapshotPage.md) | One page of snapshot records. |
| [DevToolsSnapshotPorts](interfaces/DevToolsSnapshotPorts.md) | External dependencies needed to construct the snapshot repository. |
| [DevToolsSnapshotSource](interfaces/DevToolsSnapshotSource.md) | The materialization source of a snapshot, implemented by whichever party holds the storage's global exclusive lock. |
| [DevToolsSnapshotStore](interfaces/DevToolsSnapshotStore.md) | The snapshot repository for one session; **holds at most one** active snapshot at a time. |
| [DevToolsTransferChunkPayload](interfaces/DevToolsTransferChunkPayload.md) | `TRANSFER_CHUNK` payload. |
| [DevToolsTransferIdPayload](interfaces/DevToolsTransferIdPayload.md) | `TRANSFER_COMPLETE` / `TRANSFER_CANCEL` payload. |
| [DevToolsTransferStartPayload](interfaces/DevToolsTransferStartPayload.md) | `TRANSFER_START` payload. |
| [DevToolsV2Envelope](interfaces/DevToolsV2Envelope.md) | v2 envelope for a single message type. |
| [DevToolsV2EnvelopeShape](interfaces/DevToolsV2EnvelopeShape.md) | Shape of a v2 message whose outer layer passed validation but whose payload has not been validated yet. |
| [DevToolsV2HandshakeAckPayload](interfaces/DevToolsV2HandshakeAckPayload.md) | v2 `HANDSHAKE_ACK` payload. |
| [DevToolsV2HandshakePayload](interfaces/DevToolsV2HandshakePayload.md) | v2 `HANDSHAKE` payload. |
| [DevToolsV2MessageOptions](interfaces/DevToolsV2MessageOptions.md) | Fixed fields of [createDevToolsV2Message](functions/createDevToolsV2Message.md). |
| [DevToolsV2PayloadMap](interfaces/DevToolsV2PayloadMap.md) | Mapping from message type to payload type. |
| [DevToolsVersionManager](interfaces/DevToolsVersionManager.md) | The subset of branch write operations that DevTools actually calls. |
| [DisconnectRxdbMessage](interfaces/DisconnectRxdbMessage.md) | Requests disconnecting the RxDB instance. |
| [DisconnectRxdbResultMessage](interfaces/DisconnectRxdbResultMessage.md) | Result of disconnecting the RxDB instance. |
| [DisconnectRxdbResultPayload](interfaces/DisconnectRxdbResultPayload.md) | Result payload of disconnecting the RxDB instance. |
| [EntityDataMessage](interfaces/EntityDataMessage.md) | Entity query result. |
| [EntityDataPayload](interfaces/EntityDataPayload.md) | Entity query result payload. |
| [EventMessage](interfaces/EventMessage.md) | Event message. |
| [GetBranchesMessage](interfaces/GetBranchesMessage.md) | Get-branch-list command. |
| [HandshakeAckMessage](interfaces/HandshakeAckMessage.md) | Handshake acknowledgment message. |
| [HandshakeMessage](interfaces/HandshakeMessage.md) | Handshake message. |
| [HandshakePayload](interfaces/HandshakePayload.md) | Handshake payload: protocol version + the capability tier granted by this page. |
| [InspectDbMessage](interfaces/InspectDbMessage.md) | Database inspection command. |
| [PingMessage](interfaces/PingMessage.md) | DevTools status probe message. |
| [QueryEntityMessage](interfaces/QueryEntityMessage.md) | Entity query command. |
| [QueryEntityPayload](interfaces/QueryEntityPayload.md) | Entity query command parameters. |
| [SerializedEvent](interfaces/SerializedEvent.md) | A serialized RxDB event. |
| [SwitchBranchMessage](interfaces/SwitchBranchMessage.md) | Switch-branch command. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [AnyDevToolsMessage](type-aliases/AnyDevToolsMessage.md) | All legal RxDB DevTools messages. |
| [DevToolsAuthorization](type-aliases/DevToolsAuthorization.md) | Authorization verdict. |
| [DevToolsCancelTimer](type-aliases/DevToolsCancelTimer.md) | Cancels a registered timer task. |
| [DevToolsCapability](type-aliases/DevToolsCapability.md) | Command capability tiers the page grants to DevTools. |
| [DevToolsCommandMessage](type-aliases/DevToolsCommandMessage.md) | All messages allowed to enter the page command handler. |
| [DevToolsConnectorNegotiationMessage](type-aliases/DevToolsConnectorNegotiationMessage.md) | Messages the connector negotiation state machine may emit: an eager legacy handshake, or v2 frames. |
| [DevToolsConnectorNegotiationState](type-aliases/DevToolsConnectorNegotiationState.md) | State of the connector negotiation state machine. |
| [DevToolsControlPlaneErrorCode](type-aliases/DevToolsControlPlaneErrorCode.md) | Control-plane error codes. |
| [DevToolsEntityErrorCode](type-aliases/DevToolsEntityErrorCode.md) | Union type of [DEVTOOLS\_ENTITY\_ERROR\_CODES](variables/DEVTOOLS_ENTITY_ERROR_CODES.md). |
| [DevToolsEntityFieldType](type-aliases/DevToolsEntityFieldType.md) | Model field type; only the stable strings needed for table display are allowed. |
| [DevToolsErrorCode](type-aliases/DevToolsErrorCode.md) | All error codes visible externally in v2. |
| [DevToolsErrorOrigin](type-aliases/DevToolsErrorOrigin.md) | The platform an error originates from. |
| [DevToolsMutationPolicy](type-aliases/DevToolsMutationPolicy.md) | Whether the owner opts in to write operations separately. |
| [DevToolsOpfsEntry](type-aliases/DevToolsOpfsEntry.md) | A single directory entry; `entries` appears only on directories. |
| [DevToolsPanelDownloadResult](type-aliases/DevToolsPanelDownloadResult.md) | Result of a single download. |
| [DevToolsPanelNegotiationMessage](type-aliases/DevToolsPanelNegotiationMessage.md) | Messages the panel negotiation state machine may emit: v2 frames, or the legacy ACK inside the v1 facade. |
| [DevToolsPanelNegotiationState](type-aliases/DevToolsPanelNegotiationState.md) | State of the panel negotiation state machine. |
| [DevToolsPanelRequestResult](type-aliases/DevToolsPanelRequestResult.md) | Result of a single request; **never rejects** — errors are values, callers need no try/catch. |
| [DevToolsPanelUploadResult](type-aliases/DevToolsPanelUploadResult.md) | Result of a single upload. |
| [DevToolsProviderDomain](type-aliases/DevToolsProviderDomain.md) | Provider domains. |
| [DevToolsProviderErrorCode](type-aliases/DevToolsProviderErrorCode.md) | Provider data-plane error codes. |
| [DevToolsProviderKind](type-aliases/DevToolsProviderKind.md) | Mapping from domain to semantic kind. |
| [DevToolsProviderOperation](type-aliases/DevToolsProviderOperation.md) | Mapping from domain to operation name. |
| [DevToolsProviderResult](type-aliases/DevToolsProviderResult.md) | Result of a single provider call. |
| [DevToolsProviderRuntime](type-aliases/DevToolsProviderRuntime.md) | Provider runtimes. |
| [DevToolsRxDB](type-aliases/DevToolsRxDB.md) | The subset of RxDB capabilities that DevTools actually uses. |
| [DevToolsSnapshotCaptureResult](type-aliases/DevToolsSnapshotCaptureResult.md) | Result of a single snapshot materialization. |
| [DevToolsSnapshotLockResult](type-aliases/DevToolsSnapshotLockResult.md) | Result of a single task run inside the lock. |
| [DevToolsSnapshotRecord](type-aliases/DevToolsSnapshotRecord.md) | Canonical snapshot record: `[side, logicalPath, id, size, contentVersion]`. |
| [DevToolsSnapshotResult](type-aliases/DevToolsSnapshotResult.md) | Result of a single snapshot request. |
| [DevToolsSnapshotSide](type-aliases/DevToolsSnapshotSide.md) | Whether a snapshot record comes from metadata or the file body. |
| [DevToolsUnavailableReason](type-aliases/DevToolsUnavailableReason.md) | Reasons why a provider is unavailable. |
| [DevToolsV2Direction](type-aliases/DevToolsV2Direction.md) | Transmission direction of a v2 frame. |
| [DevToolsV2Message](type-aliases/DevToolsV2Message.md) | Discriminated union of all v2 messages. |
| [DevToolsV2MessageType](type-aliases/DevToolsV2MessageType.md) | v2 message types. |
| [DevToolsWireValue](type-aliases/DevToolsWireValue.md) | Versioned non-JSON values supported by the DevTools wire protocol. |
| [DisconnectMessage](type-aliases/DisconnectMessage.md) | Communication-disconnect message initiated by the page or DevTools. |
| [DisconnectStatus](type-aliases/DisconnectStatus.md) | RxDB disconnect result status. |
| [GetEntityMetadataFn](type-aliases/GetEntityMetadataFn.md) | Entity metadata reader function. |
| [MessageDirection](type-aliases/MessageDirection.md) | RxDB DevTools message directions. |
| [MessageOfType](type-aliases/MessageOfType.md) | Resolves the message definition for a given message type. |
| [MessageType](type-aliases/MessageType.md) | RxDB DevTools message types. |

## Variables

| Variable | Description |
| ------ | ------ |
| [CONNECTOR\_MUTATION\_POLICY](variables/CONNECTOR_MUTATION_POLICY.md) | Default write switch for the in-page connector. |
| [DEVTOOLS\_BROWSER\_OPFS\_MAX\_TRANSFER\_BYTES](variables/DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES.md) | The fixed `maxTransferBytes` for browser OPFS (50 MiB). |
| [DEVTOOLS\_BROWSER\_SETTINGS\_DESCRIPTOR](variables/DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR.md) | Descriptor of the browser settings provider. |
| [DEVTOOLS\_CAPABILITIES](variables/DEVTOOLS_CAPABILITIES.md) | All capability tiers, ordered from narrowest to widest permissions. |
| [DEVTOOLS\_CONTROL\_PLANE\_ERROR\_CODES](variables/DEVTOOLS_CONTROL_PLANE_ERROR_CODES.md) | Control-plane error codes (exactly 12). |
| [DEVTOOLS\_DEFAULT\_PAGE\_SIZE](variables/DEVTOOLS_DEFAULT_PAGE_SIZE.md) | Default pagination page size. |
| [DEVTOOLS\_ENTITY\_ERROR\_CODES](variables/DEVTOOLS_ENTITY_ERROR_CODES.md) | Structured error codes of `ENTITY_DATA`. |
| [DEVTOOLS\_MAX\_CHUNK\_BYTES](variables/DEVTOOLS_MAX_CHUNK_BYTES.md) | Maximum decoded bytes of a single chunk (256 KiB). Measured in **decoded** bytes, not base64 string length. |
| [DEVTOOLS\_MAX\_ERROR\_MESSAGE\_LENGTH](variables/DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH.md) | Maximum characters of an outward error message. |
| [DEVTOOLS\_MAX\_IDENTIFIER\_LENGTH](variables/DEVTOOLS_MAX_IDENTIFIER_LENGTH.md) | Maximum characters of `requestId` / `transferId`. |
| [DEVTOOLS\_MAX\_INFLIGHT\_REQUESTS](variables/DEVTOOLS_MAX_INFLIGHT_REQUESTS.md) | Per-session cap on in-flight requests. |
| [DEVTOOLS\_MAX\_INFLIGHT\_TRANSFERS](variables/DEVTOOLS_MAX_INFLIGHT_TRANSFERS.md) | Per-session cap on in-flight transfers. |
| [DEVTOOLS\_MAX\_PAGE\_SIZE](variables/DEVTOOLS_MAX_PAGE_SIZE.md) | Maximum pagination page size. |
| [DEVTOOLS\_MAX\_PROTOCOL\_VERSION](variables/DEVTOOLS_MAX_PROTOCOL_VERSION.md) | Upper bound of the protocol version number. |
| [DEVTOOLS\_MAX\_REQUEST\_TOMBSTONES](variables/DEVTOOLS_MAX_REQUEST_TOMBSTONES.md) | Per-session cap on terminal request ID tombstones. |
| [DEVTOOLS\_MAX\_SNAPSHOT\_BYTES](variables/DEVTOOLS_MAX_SNAPSHOT_BYTES.md) | Maximum canonical record bytes of a single snapshot (32 MiB); excludes the transport envelope. |
| [DEVTOOLS\_MAX\_SNAPSHOT\_EPOCH\_RETRIES](variables/DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES.md) | Maximum retries of a snapshot whose capture epoch changed. |
| [DEVTOOLS\_MAX\_SNAPSHOT\_RECORDS](variables/DEVTOOLS_MAX_SNAPSHOT_RECORDS.md) | Maximum record count of a single snapshot; exceeding it errors immediately and **never truncates**. |
| [DEVTOOLS\_MAX\_SUPPORTED\_VERSIONS](variables/DEVTOOLS_MAX_SUPPORTED_VERSIONS.md) | Maximum length of `PROTOCOL_HELLO.supportedVersions`. |
| [DEVTOOLS\_MAX\_TRANSFER\_BYTES\_LIMIT](variables/DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT.md) | Absolute upper bound of `maxTransferBytes` (1 GiB). |
| [DEVTOOLS\_MAX\_TRANSFER\_TOMBSTONES](variables/DEVTOOLS_MAX_TRANSFER_TOMBSTONES.md) | Per-session cap on terminal transfer ID tombstones. |
| [DEVTOOLS\_MESSAGE\_REQUIRED\_CAPABILITY](variables/DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY.md) | Minimum tier required for each message type. |
| [DEVTOOLS\_MIN\_CHUNK\_BYTES](variables/DEVTOOLS_MIN_CHUNK_BYTES.md) | Minimum decoded bytes of a single chunk; an empty chunk is always illegal. |
| [DEVTOOLS\_MIN\_PROTOCOL\_VERSION](variables/DEVTOOLS_MIN_PROTOCOL_VERSION.md) | Lower bound of the protocol version number. |
| [DEVTOOLS\_NEGOTIATION\_WINDOW\_MS](variables/DEVTOOLS_NEGOTIATION_WINDOW_MS.md) | Version decision window, in milliseconds. |
| [DEVTOOLS\_OPERATION\_REQUIRED\_CAPABILITY](variables/DEVTOOLS_OPERATION_REQUIRED_CAPABILITY.md) | Minimum tier required for each operation. |
| [DEVTOOLS\_PLATFORM\_ERROR\_KEYS](variables/DEVTOOLS_PLATFORM_ERROR_KEYS.md) | All platform error codes registered by this module, grouped by origin. |
| [DEVTOOLS\_PROTOCOL\_VERSION](variables/DEVTOOLS_PROTOCOL_VERSION.md) | DevTools page protocol version, incremented on incompatible envelope/payload changes. |
| [DEVTOOLS\_PROTOCOL\_VERSION\_V2](variables/DEVTOOLS_PROTOCOL_VERSION_V2.md) | v2 protocol version number. |
| [DEVTOOLS\_PROVIDER\_DOMAINS](variables/DEVTOOLS_PROVIDER_DOMAINS.md) | Provider domains. |
| [DEVTOOLS\_PROVIDER\_ERROR\_CODES](variables/DEVTOOLS_PROVIDER_ERROR_CODES.md) | Provider data-plane error codes (exactly 18). |
| [DEVTOOLS\_PROVIDER\_ERROR\_RETRYABLE](variables/DEVTOOLS_PROVIDER_ERROR_RETRYABLE.md) | Whether each provider error code is worth retrying by the peer. |
| [DEVTOOLS\_PROVIDER\_KINDS](variables/DEVTOOLS_PROVIDER_KINDS.md) | Semantic kinds allowed for each domain. |
| [DEVTOOLS\_PROVIDER\_OPERATIONS](variables/DEVTOOLS_PROVIDER_OPERATIONS.md) | Operations each domain may declare; **the order is the protocol definition order**. |
| [DEVTOOLS\_PROVIDER\_RUNTIMES](variables/DEVTOOLS_PROVIDER_RUNTIMES.md) | Provider runtimes; **display only**, must never affect behavior decisions. |
| [DEVTOOLS\_REQUEST\_TIMEOUT\_MS](variables/DEVTOOLS_REQUEST_TIMEOUT_MS.md) | End-to-end time limit for non-streaming requests, in milliseconds; starts when the request passes the guard. |
| [DEVTOOLS\_SNAPSHOT\_CURSOR\_IDLE\_MS](variables/DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS.md) | Inactivity release time limit of a snapshot cursor, in milliseconds. |
| [DEVTOOLS\_SNAPSHOT\_TIMEOUT\_MS](variables/DEVTOOLS_SNAPSHOT_TIMEOUT_MS.md) | End-to-end time limit of a snapshot, in milliseconds; covers lock waiting, materialization, epoch retries, and resource registration. |
| [DEVTOOLS\_TRANSFER\_IDLE\_TIMEOUT\_MS](variables/DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS.md) | Idle time limit of a transfer, in milliseconds. |
| [DEVTOOLS\_TRANSFER\_TOTAL\_TIMEOUT\_MS](variables/DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS.md) | Total duration cap of a transfer, in milliseconds; starts when START passes the guard. |
| [DEVTOOLS\_UNAVAILABLE\_REASONS](variables/DEVTOOLS_UNAVAILABLE_REASONS.md) | Shared reason codes required when `kind: 'unavailable'`. |
| [DEVTOOLS\_V2\_MESSAGE\_DIRECTIONS](variables/DEVTOOLS_V2_MESSAGE_DIRECTIONS.md) | Directions allowed for each message; `'both'` means bidirectional. |
| [DEVTOOLS\_V2\_MESSAGE\_TYPES](variables/DEVTOOLS_V2_MESSAGE_TYPES.md) | v2 message types. |
| [DEVTOOLS\_WIRE\_VERSION](variables/DEVTOOLS_WIRE_VERSION.md) | Version of the DevTools wire value contract. |
| [RXDB\_DEVTOOLS\_MESSAGE](variables/RXDB_DEVTOOLS_MESSAGE.md) | Source identifier of RxDB DevTools messages. |
| [RXDB\_EVENT\_TYPES](variables/RXDB_EVENT_TYPES.md) | The event types actually subscribed to (keys whose value is `true` in RXDB\_EVENT\_SUBSCRIPTIONS). |

## Functions

| Function | Description |
| ------ | ------ |
| [authorizeMessage](functions/authorizeMessage.md) | Decides whether a message type may be sent or received at a given tier. |
| [authorizeOperation](functions/authorizeOperation.md) | Performs three-layer authorization for an operation request. |
| [createConnectorNegotiation](functions/createConnectorNegotiation.md) | Creates the connector-side negotiation state machine. |
| [createConnectorProviders](functions/createConnectorProviders.md) | Assembles provider seams according to the capabilities this page actually has. |
| [createDevToolsBrowserSettingsProvider](functions/createDevToolsBrowserSettingsProvider.md) | Creates a browser `settings` provider. |
| [createDevToolsConnectorEndpoint](functions/createDevToolsConnectorEndpoint.md) | Creates the connector-side v2 endpoint. |
| [createDevToolsDesktopSettingsDescriptor](functions/createDevToolsDesktopSettingsDescriptor.md) | Descriptor of the desktop settings provider. |
| [createDevToolsDesktopSettingsProvider](functions/createDevToolsDesktopSettingsProvider.md) | Creates a desktop `settings` provider. |
| [createDevToolsError](functions/createDevToolsError.md) | Creates an outward error envelope. |
| [createDevToolsNativeFilesProvider](functions/createDevToolsNativeFilesProvider.md) | Creates a `files` provider backed by the native filesystem. |
| [createDevToolsNativeSnapshotSource](functions/createDevToolsNativeSnapshotSource.md) | Creates a snapshot materialization source for a native host. |
| [createDevToolsOpfsFilesProvider](functions/createDevToolsOpfsFilesProvider.md) | Creates a browser OPFS `files` provider. |
| [createDevToolsPanelEndpoint](functions/createDevToolsPanelEndpoint.md) | Creates the panel-side data-plane client. |
| [createDevToolsReadOnlySettingsProvider](functions/createDevToolsReadOnlySettingsProvider.md) | Creates a read-only `settings` provider from the given descriptor. |
| [createDevToolsRxdbDatabaseProvider](functions/createDevToolsRxdbDatabaseProvider.md) | Creates an RxDB `database` provider. |
| [createDevToolsSnapshotStore](functions/createDevToolsSnapshotStore.md) | Creates a session-level snapshot repository. |
| [createDevToolsV2Message](functions/createDevToolsV2Message.md) | Constructs a v2 message. |
| [createMessage](functions/createMessage.md) | Creates an RxDB DevTools message. |
| [createPanelNegotiation](functions/createPanelNegotiation.md) | Creates the panel-side negotiation state machine. |
| [createProviderError](functions/createProviderError.md) | Constructs a provider error according to the shared retryability table. |
| [createSessionId](functions/createSessionId.md) | Generates a canonical UUID v4 as the `sessionId`. |
| [createSystemClock](functions/createSystemClock.md) | A real clock based on the host `Date.now` / `setTimeout`. |
| [createWindowConnectorTransport](functions/createWindowConnectorTransport.md) | Browser implementation: window bus + MessageChannel private port. |
| [decodeCanonicalBase64](functions/decodeCanonicalBase64.md) | Decodes standard RFC 4648 base64 and requires the input to be the **canonical** encoding of that byte sequence. |
| [encodeCanonicalBase64](functions/encodeCanonicalBase64.md) | Encodes a byte sequence as standard RFC 4648 base64 (with canonical padding). |
| [getDevToolsConnector](functions/getDevToolsConnector.md) | Gets or creates the global RxDB DevTools connector. |
| [isCanonicalUuidV4](functions/isCanonicalUuidV4.md) | Checks whether a value is a canonical (lowercase, hyphenated) UUID v4. |
| [isControlPlaneErrorCode](functions/isControlPlaneErrorCode.md) | Checks whether a value is a control-plane error code. |
| [isDevToolsCapability](functions/isDevToolsCapability.md) | Checks whether a value is a legal capability tier. |
| [isDevToolsCommandMessage](functions/isDevToolsCommandMessage.md) | Checks whether a legal message is a command allowed into the page handler. |
| [isDevToolsErrorPayload](functions/isDevToolsErrorPayload.md) | Checks whether a value is a legal outward error envelope. |
| [isDevToolsI18nSnapshot](functions/isDevToolsI18nSnapshot.md) | Validates an internationalization snapshot from the debug channel. |
| [isDevToolsIdentifier](functions/isDevToolsIdentifier.md) | Checks whether a value is a legal `requestId` / `transferId`. |
| [isDevToolsMessage](functions/isDevToolsMessage.md) | Strictly validates the message envelope, direction, known type, and command payload. |
| [isDevToolsProviderDescriptor](functions/isDevToolsProviderDescriptor.md) | Checks whether a value is a legal provider descriptor. |
| [isDevToolsProviderDescriptorSet](functions/isDevToolsProviderDescriptorSet.md) | Checks whether a value is a legal descriptor set: at most one per domain. |
| [isDevToolsProviderDomain](functions/isDevToolsProviderDomain.md) | Checks whether a value is a known provider domain. |
| [isDevToolsV2Envelope](functions/isDevToolsV2Envelope.md) | Wide outer guard: checks whether a value is the shell of a v2 message, **without validating the payload**. |
| [isDevToolsV2Message](functions/isDevToolsV2Message.md) | Strict inner guard: checks whether a value is a fully legal v2 message. |
| [isMaxTransferBytes](functions/isMaxTransferBytes.md) | Checks whether a value is a legal `maxTransferBytes` (a non-negative safe integer from 0 to 1 GiB). |
| [isMutatingOperation](functions/isMutatingOperation.md) | Checks whether an operation changes persistent state. |
| [isPageSize](functions/isPageSize.md) | Checks whether a value is a legal `pageSize` (1 to 500). |
| [isProviderErrorCode](functions/isProviderErrorCode.md) | Checks whether a value is a provider error code. |
| [isRedactedErrorMessage](functions/isRedactedErrorMessage.md) | Checks whether a value is an error description that meets the redaction requirements. |
| [isSupportedVersionList](functions/isSupportedVersionList.md) | Checks whether a value is a legal `PROTOCOL_HELLO.supportedVersions`. |
| [isValidPathSegment](functions/isValidPathSegment.md) | Checks whether a path segment is legal. |
| [isWithinTransferLimit](functions/isWithinTransferLimit.md) | Checks whether the declared total byte count is within the negotiated limit. |
| [joinLogicalPath](functions/joinLogicalPath.md) | Joins validated segments back into a logical path. |
| [mapPlatformError](functions/mapPlatformError.md) | Maps a platform exception into a provider error payload. |
| [parseLogicalPath](functions/parseLogicalPath.md) | Splits a wire path into validated segments. |
| [resetDevToolsConnector](functions/resetDevToolsConnector.md) | Resets the global RxDB DevTools connector. |
| [resolveBrowserOpfsRoot](functions/resolveBrowserOpfsRoot.md) | Probes whether this page has OPFS available. |
| [resolveNegotiatedTransferLimit](functions/resolveNegotiatedTransferLimit.md) | Negotiates the transfer limit that actually takes effect. |
| [satisfiesCapability](functions/satisfiesCapability.md) | Checks whether the actual tier reaches the required tier. |
| [saveFileThroughPage](functions/saveFileThroughPage.md) | Saves a file through the page's own download path. |
| [serialize](functions/serialize.md) | Serializes RxDB events |
| [serializeDevToolsValue](functions/serializeDevToolsValue.md) | Converts a runtime value into a DevTools wire value that is detached from the original object and JSON-safe. |
| [snapshotRecordBytes](functions/snapshotRecordBytes.md) | Byte count of one canonical record. |
| [splitLogicalPath](functions/splitLogicalPath.md) | Splits a path into "parent directory segments + final segment". |
| [totalSnapshotBytes](functions/totalSnapshotBytes.md) | Total byte count of a batch of canonical records. |
