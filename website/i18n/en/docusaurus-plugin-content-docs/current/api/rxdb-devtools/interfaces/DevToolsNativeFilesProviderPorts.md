# DevToolsNativeFilesProviderPorts

Defined in: [native/native-files-provider.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L88)

The construction ports of the native `files` provider.

## Properties

### filesystem \{#filesystem\}

```ts
readonly filesystem: DevToolsNativeFilesystem;
```

Defined in: [native/native-files-provider.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L90)

The host file capabilities.

***

### maxTransferBytes \{#maxtransferbytes\}

```ts
readonly maxTransferBytes: number;
```

Defined in: [native/native-files-provider.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L92)

The per-transfer limit declared in the descriptor; must be the host's **real** limit.

***

### runtime \{#runtime\}

```ts
readonly runtime: "browser" | "electron" | "tauri";
```

Defined in: [native/native-files-provider.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L103)

The host source shown in the descriptor.

#### Remarks

**Required, with no default**: `kind: 'native-files'` is host-independent (Electron and Tauri use the same kind, the same operations and state machine), and this display field is the only thing that distinguishes the two ends. Giving it a default would let one end silently claim to be the other when it forgets to declare — that is a fallback, not a default.

It only goes into the descriptor and does not participate in any behavioral branch: the same kind must have the same operations and limits under different runtimes.

***

### snapshot? \{#snapshot\}

```ts
readonly snapshot?: DevToolsSnapshotPorts;
```

Defined in: [native/native-files-provider.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L112)

The diagnostic snapshot ports; when given, the provider additionally provides snapshot materialization and paging (AC#48).

#### Remarks

When omitted, only file read/write is available and the `snapshot` mode of `files.list` answers `provider_unsupported`. A snapshot is not an independent message type or operation in the protocol — it switches through the parameters of `files.list` into the provider-internal [DevToolsSnapshotStore](DevToolsSnapshotStore.md), adding no new kind / error code / message type.
