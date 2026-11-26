# DevToolsOpfsFilesProviderPorts

Defined in: [browser/opfs-files-provider.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L52)

Construction ports for the OPFS provider.

## Properties

### maxTransferBytes \{#maxtransferbytes\}

```ts
readonly maxTransferBytes: number;
```

Defined in: [browser/opfs-files-provider.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L56)

The per-transfer limit declared by the descriptor.

***

### runtime? \{#runtime\}

```ts
readonly runtime?: "browser" | "electron" | "tauri";
```

Defined in: [browser/opfs-files-provider.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L65)

The runtime shown in the descriptor for display purposes; defaults to `browser`.

#### Remarks

OPFS is not browser-specific — Tauri / Electron webviews can also land on OPFS. Hard-coding
`browser` would make the descriptor set of those hosts self-contradictory (`database` reports
`tauri`, `files` reports `browser`), leaving the panel unable to say whom it is connected to.
This field only feeds display and takes part in no behavioral decisions.

## Methods

### getRootDirectory() \{#getrootdirectory\}

```ts
getRootDirectory(): Promise<FileSystemDirectoryHandle>;
```

Defined in: [browser/opfs-files-provider.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L54)

The sole entry point to the OPFS root directory; the provider does not touch `navigator`
directly.

#### Returns

`Promise`&lt;`FileSystemDirectoryHandle`&gt;

***

### saveToDisk()? \{#savetodisk\}

```ts
saveToDisk?(file, name): Promise<void>;
```

Defined in: [browser/opfs-files-provider.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/browser/opfs-files-provider.ts#L72)

Hands a file to the page's own save path.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `File` |
| `name` | `string` |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

When omitted, nothing is saved and only metadata is returned — unit tests and hosts without a
DOM use this shape. See item 2 of the module header.
