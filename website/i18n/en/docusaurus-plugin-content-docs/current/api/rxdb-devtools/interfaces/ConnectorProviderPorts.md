# ConnectorProviderPorts

Defined in: [connector-providers.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L92)

The input for assembling the in-page provider seams.

## Properties

### canClearI18nMissing? \{#cancleari18nmissing\}

```ts
canClearI18nMissing?: boolean;
```

Defined in: [connector-providers.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L126)

The diagnostic-clear permission already computed from the connector capability tier and write policy.

***

### database? \{#database\}

```ts
database?: ConnectorDatabasePorts;
```

Defined in: [connector-providers.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L98)

The RxDB entry ports; when omitted, the `database` domain is not declared.

***

### getRootDirectory? \{#getrootdirectory\}

```ts
getRootDirectory?: () => Promise<FileSystemDirectoryHandle>;
```

Defined in: [connector-providers.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L94)

The OPFS root directory entry point; when omitted, this page has no OPFS and the `files` domain is not declared.

#### Returns

`Promise`&lt;`FileSystemDirectoryHandle`&gt;

***

### i18n? \{#i18n\}

```ts
i18n?: DevToolsI18nPort;
```

Defined in: [connector-providers.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L124)

The i18n structural port explicitly injected by the application.

***

### nativeFiles? \{#nativefiles\}

```ts
nativeFiles?: Omit<DevToolsNativeFilesProviderPorts, "runtime">;
```

Defined in: [connector-providers.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L106)

The native files backend ports; when given, `files` uses `native-files` instead of OPFS.

#### Remarks

Does not include `runtime`: it is fed uniformly to every descriptor by [ConnectorProviderPorts.runtime](#runtime) at this layer. Collecting it here again would leave an entry point for "files and database reporting different hosts".

***

### runtime? \{#runtime\}

```ts
runtime?: "browser" | "electron" | "tauri";
```

Defined in: [connector-providers.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L122)

The runtime shown in descriptors; defaults to `browser`.

#### Remarks

Goes into **every** descriptor constructed at this layer: `database`, OPFS `files` and native `files` share this one value, so "files reporting electron while database reports tauri" is structurally impossible (US-905 AC#10).

The only one outside this list is `settings` — it is injected whole by the host, and its runtime follows the injected descriptor (on desktop see `createDevToolsDesktopSettingsProvider(runtime)`).

Note that runtime is not bound to kind: `kind: 'native-files'` itself is host-independent, Electron and Tauri use the same kind, the same operations and the same limits, and runtime only says "which host this data comes from".

***

### saveToDisk? \{#savetodisk\}

```ts
saveToDisk?: (file, name) => Promise<void>;
```

Defined in: [connector-providers.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L96)

Hands a file to the page's own save path; see item 2 in the OPFS provider module header.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `File` |
| `name` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

***

### settings? \{#settings\}

```ts
settings?: DevToolsProvider;
```

Defined in: [connector-providers.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L108)

The `settings` domain provider; defaults to browser settings (`kind: opfs`).
