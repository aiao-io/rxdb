# P2P sessions and file sharing

`@aiao/rxdb-plugin-p2p` provides framework-agnostic LAN peer-to-peer services. A pair of devices reuses one authenticated session; file bytes travel directly over a WebRTC DataChannel or a host-provided TLS TCP connection. File holding declarations can sync through RxDB; byte transfer and database sync are configured separately.

## Integration responsibilities

This package family is not yet part of the npm release set; verify it from the repository workspace first. The package names and code examples describe the current `main` integration — do not treat the workspace version `0.0.28` as proof that these packages are published. For local run entry points, see [Capabilities and examples](/getting-started/capabilities.md).

The application owns device discovery, signaling, authentication, and byte storage, and connects its channel to `P2PByteTransport`. The plugin provides no hosted signaling service and never contacts the network on its own during `use()` or `connect()`.

```ts
import { rxDBPluginP2PFiles } from '@aiao/rxdb-plugin-p2p';

rxdb.use(rxDBPluginP2PFiles);
await rxdb.connect('local');
```

`local` is the name of an adapter your application registered. The plugin registers `P2PFileManifestEntity`, so it must be installed before database initialization and connection — installing it later throws. Only a `P2PPrincipal` confirmed by the authenticating host may be used to create holding declarations.

## Open a session on an existing channel

The `dataChannel`, credentials, content lookup, and authorization callback below are all provided by the application:

```ts
import {
  createP2PFilesProtocol,
  createP2PFilesSource,
  createWebRTCTransport,
  downloadP2PFile,
  openP2PSession,
  P2PSessionRegistry
} from '@aiao/rxdb-plugin-p2p';

const registry = new P2PSessionRegistry();

const session = await registry.add(
  openP2PSession({
    transport: createWebRTCTransport(dataChannel),
    role: 'initiator',
    connectionId,
    local: { principal, instanceId },
    credential,
    authenticate: verifyPeerCredential,
    protocols: [createP2PFilesProtocol({ contents: findLocalFile, authorize: authorizeRead })]
  })
);

await downloadP2PFile({ manifest, sources: [createP2PFilesSource(session, holderId)], writeChunk });
```

Both sides first exchange hello, authenticate, and negotiate the protocol version. Credentials bind to `connectionId`; a failed authentication closes the session with `unauthorized`. The files protocol authorizes every request and never queries content without authorization. `P2PSessionRegistry` deduplicates by peer identity and closes lost sessions on heartbeat timeout. Reuse the same `registry` for the application's lifetime; later transfers use the session that `registry.add()` returned.

The dialing side must serialize connection attempts to the same peer — never open two same-direction connections at once; when both sides register in opposite orders, duplicate connections may close each other. When both sides dial simultaneously, the registry decides which direction to keep by the two sides' identity key.

## File transfer boundaries

- Every chunk is verified with SHA-256, with resume support, multi-source scheduling, and bad-peer isolation; unverified chunks never touch the disk.
- Holding declarations update only when a file is obtained or deleted. Device online status comes from presence, discovery, or connection probing — it is not written into sync entities.
- Transfers and streaming receive buffer at most 8 chunks and send with channel backpressure; large files are never fully loaded into memory.
- The server fallback is an application-provided streaming `P2PServerFallback`. Only retryable P2P failures trigger the fallback; disk write failures, verification failures, or manifest contradictions fail immediately.

## Local verification

```bash
pnpm nx serve dev-rxdb-p2p
```

This app verifies sessions and file transfer. A production integration still needs to configure the actual discovery, signaling, and authentication host. For database branches and push / pull, see [Data collaboration](/collaboration/README.md).
