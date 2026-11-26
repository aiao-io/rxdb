# DevToolsProviderOptions

Defined in: [connector-types.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L108)

The part of in-page provider assembly that requires explicit injection by the host.

## Remarks

The half that the browser can detect on its own (OPFS, the page download path, the RxDB instance) does not belong here in principle — the connector assembles that itself according to the environment. What goes here is what the browser cannot detect: the native files backend, the semantic `kind` of `settings` and the runtime used for display. The fields are independent of each other, and when absent the connector assembles in browser form.

The only exception is [DevToolsProviderOptions.getRootDirectory](#getrootdirectory): it exists not to supplement the detection result, but to let the host **veto** it; see the field's own description.

## Properties

### getRootDirectory? \{#getrootdirectory\}

```ts
getRootDirectory?: () => Promise<FileSystemDirectoryHandle>;
```

Defined in: [connector-types.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L138)

Explicitly overrides the OPFS root directory entry point; returning `undefined` **removes** the `files` domain.

#### Returns

`Promise`&lt;`FileSystemDirectoryHandle`&gt;

#### Remarks

The rule above says the browser-detectable half does not belong here, and this one field is the exception, because what the host needs is a **reverse** declaration: by default the connector declares whatever `resolveBrowserOpfsRoot()` detects, but the host may already know the domain is unusable (e.g. wa-sqlite on the IDB backend cannot obtain the OPFS file entry point). In that case the entry point must be removed so the whole domain is not declared — keeping it would light up the file page and then fail operation by operation, exactly what the descriptor model exists to avoid.

Omitting this field = keep the connector's auto-detection; explicitly giving `undefined` = do not declare `files`.

---

### nativeFiles? \{#nativefiles\}

```ts
nativeFiles?: Omit<DevToolsNativeFilesProviderPorts, "runtime">;
```

Defined in: [connector-types.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L115)

The native files backend ports; when given, `files` uses `native-files` instead of OPFS.

#### Remarks

Does not include `runtime`: it is supplied uniformly by the field below; see [DevToolsProviderOptions.runtime](#runtime).

---

### providerRegistry? \{#providerregistry\}

```ts
providerRegistry?: DevToolsProviderRegistry;
```

Defined in: [connector-types.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L151)

The injection point for a whole provider registry: when given, it **wholly replaces** the connector's automatic assembly.

#### Remarks

Its relation to the fields above is not "who wins when both are given" — when a registry exists, the connector skips `createConnectorProviders` outright and the remaining fields are simply ignored, never even entering the comparison. This is the escape hatch for test assembly (the fake set from `@aiao/rxdb-devtools/testing-providers`) and for future hosts that cannot be described by a combination of ports; production hosts should keep using the per-domain fields so the descriptor assembly stays explicit.

The registry does not need `dispose` ([DevToolsProviderRegistry](DevToolsProviderRegistry.md) has no such member): the connector only does a no-op on disconnect. Implementations holding subscriptions or timers should manage their lifecycle from the injecting side.

---

### runtime? \{#runtime\}

```ts
runtime?: "browser" | "electron" | "tauri";
```

Defined in: [connector-types.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L125)

The runtime shown in descriptors; defaults to `browser`.

#### Remarks

Affects `database` and `files` (both OPFS and the native backend). The only domain unaffected is `settings` — its runtime follows the injected descriptor.

---

### settings? \{#settings\}

```ts
settings?: DevToolsProvider;
```

Defined in: [connector-types.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L117)

The `settings` domain provider; defaults to browser settings (`kind: opfs`).
