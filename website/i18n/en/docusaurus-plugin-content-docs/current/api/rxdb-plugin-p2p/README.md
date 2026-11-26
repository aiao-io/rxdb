# rxdb-plugin-p2p

A framework-agnostic service layer for LAN P2P: two devices keep exactly one authenticated session (WebRTC DataChannel or TLS TCP),
and multiple protocols multiplex over that session. The built-in files protocol handles large file sharing: holder records can be synced via RxDB, file bytes are sent directly over the session,
verified chunk-by-chunk with SHA-256, with support for resumable transfers, multi-source scheduling, bad-peer isolation and server fallback.

```ts
import {
  createAuthenticatedP2PFileManifest,
  createP2PFilesProtocol,
  createP2PFilesSource,
  createWebRTCTransport,
  downloadP2PFile,
  openP2PSession,
  rxDBPluginP2PFiles
} from '@aiao/rxdb-plugin-p2p';
```

The plugin only registers `P2PFileManifestEntity` and does not open any network connections by itself in `use()` or `connect()`.
The entity is bound and its table created during `init()`, so `use()` must run before `connect()` — calling it later throws immediately.
The application is responsible for wiring signaling, mDNS and desktop sockets into a `P2PByteTransport`, and for passing the user and device
(`P2PPrincipal`) verified by the auth host to `createAuthenticatedP2PFileManifest`.

## Sessions

Open a session on the byte channel wired by the application; the files protocol runs as one protocol on that session:

```ts
const session = openP2PSession({
  transport: createWebRTCTransport(dataChannel),
  role: 'initiator',
  connectionId,
  local: { principal, instanceId },
  credential, // issued by the auth host, bound to the connectionId
  authenticate: verifyPeerCredential, // returns the peer's P2PPrincipal, or null to reject
  protocols: [createP2PFilesProtocol({ contents: findLocalFile, authorize: authorizeRead })]
});
await downloadP2PFile({ manifest, sources: [createP2PFilesSource(session, holderId)], writeChunk });
```

- **hello and authentication**: both sides exchange hello first; credentials are bound to the `connectionId`. Failed authentication closes the session with the generic `unauthorized`, without leaking any content held locally.
- **protocol negotiation**: a protocol is usable only when both ends declare it with the same version; a request for an un-negotiated protocol gets `unsupported` and the session stays open; unknown frame types are ignored, so peers on newer versions do not disconnect because of them.
- **per-request authorization**: the files protocol runs `authorize` before looking up the content table; if the local side does not hold the content it rejects with `not_holder`; once the requester cancels, the serving side stops reading from disk.
- **scheduling and rate limiting**: each protocol's inbound concurrency defaults to 8; more than 32 unfinished requests across the whole session is treated as a protocol violation by the peer; control frames (hello, heartbeat, cancel, payload-less replies) are sent before bulk frames with payloads.
- **lifecycle**: heartbeat timeout ends the session with `peer_lost`; `P2PSessionRegistry` deduplicates by peer identity, so both ends keep a single connection when they dial each other simultaneously.

## File transfer

- **holder records never expire**: records change only when a file is acquired or removed; whether a device is online is answered by signaling presence, mDNS or connection probing — never written into the synced entity, and never derived by comparing remote timestamps against the local clock. Synced rows pass the `isP2PManifestRecord` structural validation before being used for source selection.
- **byte-range chunk requests**: requests carry the requester manifest's `offset` / `size`, and the holder reads the local file with `readRange`, so holders using different chunk sizes can still serve each other.
- **bounded buffering**: transfer concurrency, the streaming receive window and the files protocol's inbound concurrency are all capped at 8 chunks; TCP waits for `drain`, WebRTC waits for `bufferedamountlow`; frames larger than the DataChannel message limit (at least 1 KiB) are automatically fragmented, and a non-final fragment shorter than that lower bound is treated as a peer protocol violation.
- **server fallback streams to disk**: `P2PServerFallback.download` returns a response byte stream (such as a `fetch()` `body`), and chunks are written to disk only after passing per-chunk verification against the manifest — the file is never fully loaded into memory; bad chunks are not written, and a mismatch in response length or whole-file hash is an error.
- **storage failures never fall back**: disk write failures, read-back verification failures or a self-contradictory manifest throw a non-retryable `P2PTransferError`; only retryable P2P failures fall back to the server, and the fallback skips chunks that were already verified and written to disk.

LAN P2P sessions (one session per device pair, multiplexing multiple protocols) plus the manifest, chunking and direct-transfer primitives for large file sharing.

## Classes

| Class                                                     | Description                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [P2PFileManifestEntity](classes/P2PFileManifestEntity.md) | A P2P holder record replicated via sync; file bytes still travel over the P2P channel.         |
| [P2PManifestStore](classes/P2PManifestStore.md)           | Local manifest repository; sync adapters can map upsert/revoke calls onto an RxDB repository.  |
| [P2PRequestError](classes/P2PRequestError.md)             | The peer rejected a request.                                                                   |
| [P2PSessionClosedError](classes/P2PSessionClosedError.md) | The session has ended; `code` states the reason, recognizable across realms.                   |
| [P2PSessionRegistry](classes/P2PSessionRegistry.md)       | Registry of ready sessions: only one session per peer (user + device + instance).              |
| [P2PTransferError](classes/P2PTransferError.md)           | A P2P transfer failed.                                                                         |
| [RxDBPluginP2PFiles](classes/RxDBPluginP2PFiles.md)       | P2P plugin shell: registers the manifest entity into this instance's configuration on `use()`. |

## Interfaces

| Interface                                                            | Description                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [P2PByteTransport](interfaces/P2PByteTransport.md)                   | A bidirectional byte channel carrying encoded frames.                                                                               |
| [P2PCall](interfaces/P2PCall.md)                                     | The call content of a request.                                                                                                      |
| [P2PChunkDescriptor](interfaces/P2PChunkDescriptor.md)               | The byte range of a single file chunk.                                                                                              |
| [P2PChunkRequest](interfaces/P2PChunkRequest.md)                     | A chunk request: fetch by the byte range in the requester's manifest; the holder need not use the same chunk size as the requester. |
| [P2PChunkSource](interfaces/P2PChunkSource.md)                       | The minimal channel for requesting file chunks from an authenticated peer.                                                          |
| [P2PDataChannelLike](interfaces/P2PDataChannelLike.md)               | The minimal interface of a browser `RTCDataChannel`.                                                                                |
| [P2PDownloadOptions](interfaces/P2PDownloadOptions.md)               | Inputs for P2P routing. The server is only invoked when no peer is available or P2P failed retryably.                               |
| [P2PFileManifest](interfaces/P2PFileManifest.md)                     | A file manifest; once a manifest is published, `chunkSize` and `chunkHashes` must never be rewritten.                               |
| [P2PFilesAuthorizeContext](interfaces/P2PFilesAuthorizeContext.md)   | Context for per-request authorization.                                                                                              |
| [P2PFilesProtocolOptions](interfaces/P2PFilesProtocolOptions.md)     | Serving options for the files protocol; the local side serves chunks only when both are provided.                                   |
| [P2PHandlerResult](interfaces/P2PHandlerResult.md)                   | The return value of a protocol handler; the default result is `null` with an empty payload.                                         |
| [P2PInboundRequest](interfaces/P2PInboundRequest.md)                 | An inbound request passed to a protocol handler.                                                                                    |
| [P2PJsonObject](interfaces/P2PJsonObject.md)                         | A JSON object that frame metadata can carry.                                                                                        |
| [P2PLocalContent](interfaces/P2PLocalContent.md)                     | A file held by the local side.                                                                                                      |
| [P2PManifestRecord](interfaces/P2PManifestRecord.md)                 | A holder record: a device verified by the auth host holds some content.                                                             |
| [P2PManifestRepository](interfaces/P2PManifestRepository.md)         | The manifest repository interface for the sync layer to adapt.                                                                      |
| [P2PPeerDiscovery](interfaces/P2PPeerDiscovery.md)                   | The discovery seam callable from mDNS/TCP runtimes; browser implementations use signaling instead.                                  |
| [P2PPeerIdentity](interfaces/P2PPeerIdentity.md)                     | The identity of one end of a session: an authenticated principal plus a running instance.                                           |
| [P2PPeerSession](interfaces/P2PPeerSession.md)                       | A session between two devices.                                                                                                      |
| [P2PPrincipal](interfaces/P2PPrincipal.md)                           | A user and device verified by the auth host.                                                                                        |
| [P2PProtocol](interfaces/P2PProtocol.md)                             | A protocol supported by the local side.                                                                                             |
| [P2PReply](interfaces/P2PReply.md)                                   | The reply to a request.                                                                                                             |
| [P2PServerFallback](interfaces/P2PServerFallback.md)                 | Server fallback downloader; the implementation is responsible for reusing the existing HTTP adapter's auth configuration.           |
| [P2PSessionOptions](interfaces/P2PSessionOptions.md)                 | Options for opening a session.                                                                                                      |
| [P2PSignalingChannel](interfaces/P2PSignalingChannel.md)             | Server signaling only relays authenticated SDP/ICE and never participates in byte transfer.                                         |
| [P2PTcpSocketLike](interfaces/P2PTcpSocketLike.md)                   | Minimal event interface of a desktop TCP/TLS socket, adaptable from both Electron (Node `tls.TLSSocket`) and Tauri.                 |
| [P2PTransferOptions](interfaces/P2PTransferOptions.md)               | Transfer write-to-disk and progress callbacks.                                                                                      |
| [P2PTransferProgress](interfaces/P2PTransferProgress.md)             | A local progress event; never written into a synced entity.                                                                         |
| [P2PTransferResult](interfaces/P2PTransferResult.md)                 | Summary after a transfer completes.                                                                                                 |
| [P2PWebRTCTransportOptions](interfaces/P2PWebRTCTransportOptions.md) | WebRTC adapter options.                                                                                                             |

## Type Aliases

| Type Alias                                                             | Description                                                                                                                         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [P2PContentLookup](type-aliases/P2PContentLookup.md)                   | Looks up the local file held for a content hash; returns undefined when absent.                                                     |
| [P2PDataChannelEvent](type-aliases/P2PDataChannelEvent.md)             | DataChannel event names.                                                                                                            |
| [P2PFrame](type-aliases/P2PFrame.md)                                   | A session frame: JSON metadata plus a binary payload; only requests and replies carry payloads.                                     |
| [P2PJsonValue](type-aliases/P2PJsonValue.md)                           | A JSON value that frame metadata can carry.                                                                                         |
| [P2PSessionCloseCode](type-aliases/P2PSessionCloseCode.md)             | The reason a session ended.                                                                                                         |
| [P2PSessionRole](type-aliases/P2PSessionRole.md)                       | The local side's role in the session: the side initiating the connection is `initiator`; used for deduplicating simultaneous dials. |
| [P2PSessionState](type-aliases/P2PSessionState.md)                     | Session state.                                                                                                                      |
| [P2PSignalingMessage](type-aliases/P2PSignalingMessage.md)             | A message relayed through the server's dedicated signaling route.                                                                   |
| [RxDBPluginP2PFilesOptions](type-aliases/RxDBPluginP2PFilesOptions.md) | The P2P files plugin has no options: it only registers the manifest entity and opens no network connections.                        |

## Variables

| Variable                                                                 | Description                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DEFAULT\_P2P\_CHUNK\_SIZE](variables/DEFAULT_P2P_CHUNK_SIZE.md)         | Defaults to 48 KiB: one chunk plus frame metadata fits into a single 64 KiB DataChannel message without fragmentation.                                                          |
| [MAX\_P2P\_CHUNK\_SIZE](variables/MAX_P2P_CHUNK_SIZE.md)                 | The largest chunk size a manifest allows, equal to the session frame payload limit; chunks larger than a single DataChannel message are sent fragmented by the transport layer. |
| [P2P\_FILE\_MANIFEST\_ENTITY](variables/P2P_FILE_MANIFEST_ENTITY.md)     | The file manifest entity name used by the sync layer.                                                                                                                           |
| [P2P\_FILES\_PROTOCOL](variables/P2P_FILES_PROTOCOL.md)                  | The name the files protocol declares in hello.                                                                                                                                  |
| [P2P\_FILES\_PROTOCOL\_VERSION](variables/P2P_FILES_PROTOCOL_VERSION.md) | The files protocol version.                                                                                                                                                     |
| [P2P\_SESSION\_VERSION](variables/P2P_SESSION_VERSION.md)                | The session protocol version: mismatched values in hello mark the two ends as incompatible.                                                                                     |
| [rxDBPluginP2PFiles](variables/rxDBPluginP2PFiles.md)                    | Installs the P2P files plugin; must call `rxdb.use()` before `connect()`.                                                                                                       |

## Functions

| Function                                                                              | Description                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [createAuthenticatedP2PFileManifest](functions/createAuthenticatedP2PFileManifest.md) | Creates a file manifest with a holder record from an already-authenticated principal.                                                                                                                   |
| [createChunkRequestHandler](functions/createChunkRequestHandler.md)                   | Builds a chunk request handler that serves only this manifest's content.                                                                                                                                |
| [createLocalManifestDiscovery](functions/createLocalManifestDiscovery.md)             | Creates a discovery implementation usable offline from the local manifest repository.                                                                                                                   |
| [createManifestRecord](functions/createManifestRecord.md)                             | Generates a holder record from an authenticated identity; callers cannot claim another holderId.                                                                                                        |
| [createP2PFileManifest](functions/createP2PFileManifest.md)                           | Builds an immutable manifest from a randomly-readable byte source.                                                                                                                                      |
| [createP2PFilesProtocol](functions/createP2PFilesProtocol.md)                         | The files protocol: peers fetch chunks by the byte ranges of the requester's manifest; any number of files can be pulled over one session.                                                              |
| [createP2PFilesSource](functions/createP2PFilesSource.md)                             | Adapts a session into the chunk source used by `transferP2PFile`.                                                                                                                                       |
| [createTcpTransport](functions/createTcpTransport.md)                                 | Desktop TCP/TLS adapter: 4-byte unsigned big-endian length prefix + frame, preventing packet coalescing/splitting.                                                                                      |
| [createWebRTCTransport](functions/createWebRTCTransport.md)                           | Browser WebRTC DataChannel adapter; DataChannel provides DTLS encryption on its own.                                                                                                                    |
| [decodeP2PFrame](functions/decodeP2PFrame.md)                                         | Decodes and strictly validates a frame.                                                                                                                                                                 |
| [deriveHolderId](functions/deriveHolderId.md)                                         | Derives a stable holder ID from an authenticated identity; the credential itself is never written into the manifest.                                                                                    |
| [describeChunk](functions/describeChunk.md)                                           | Returns the description of one chunk according to the manifest.                                                                                                                                         |
| [describeChunks](functions/describeChunks.md)                                         | Enumerates all chunks in the manifest.                                                                                                                                                                  |
| [digestSha256Hex](functions/digestSha256Hex.md)                                       | Computes the SHA-256 of a byte span and returns 64 lowercase hex characters.                                                                                                                            |
| [downloadFromServer](functions/downloadFromServer.md)                                 | Verifies the server response stream chunk-by-chunk against the manifest and writes to disk: bad chunks are not written, a response length mismatch is an error, and the whole file never enters memory. |
| [downloadP2PFile](functions/downloadP2PFile.md)                                       | Tries peers first; falls back to the server explicitly when no peer is available or P2P failed retryably.                                                                                               |
| [encodeP2PFrame](functions/encodeP2PFrame.md)                                         | Encodes a frame: 4-byte unsigned big-endian metadata length + JSON metadata + payload; error text is truncated to the protocol limit.                                                                   |
| [findP2PFileHolders](functions/findP2PFileHolders.md)                                 | Extracts the holder records of a content from sync results.                                                                                                                                             |
| [isManifestOwnedBy](functions/isManifestOwnedBy.md)                                   | Checks whether the manifest is held by the given authenticated principal on the given device.                                                                                                           |
| [isP2PManifestRecord](functions/isP2PManifestRecord.md)                               | Checks whether a synced row satisfies the manifest's content-addressing rules.                                                                                                                          |
| [manifestId](functions/manifestId.md)                                                 | Creates the manifest primary key, making writes idempotent for the same content and holder.                                                                                                             |
| [openP2PSession](functions/openP2PSession.md)                                         | Opens a session on an established byte channel: both sides exchange hello and authenticate the peer first, then multiple protocols multiplex over the same channel.                                     |
| [peerIdentityKey](functions/peerIdentityKey.md)                                       | The stable key of an identity, used for per-peer registration and deduplication; the key differs whenever the user, device or instance differs.                                                         |
| [toRxDBManifestDocument](functions/toRxDBManifestDocument.md)                         | Maps a wire manifest onto an RxDB entity row.                                                                                                                                                           |
| [toSyncManifestDocument](functions/toSyncManifestDocument.md)                         | Converts a holder record into a sync document, explicitly declaring that it travels via sync rather than local storage.                                                                                 |
| [transferP2PFile](functions/transferP2PFile.md)                                       | Pulls manifest chunks from multiple peers.                                                                                                                                                              |
| [verifyChunk](functions/verifyChunk.md)                                               | Verifies the length and hash of a chunk.                                                                                                                                                                |
| [verifyContentHash](functions/verifyContentHash.md)                                   | Verifies the content hash of the complete file.                                                                                                                                                         |
