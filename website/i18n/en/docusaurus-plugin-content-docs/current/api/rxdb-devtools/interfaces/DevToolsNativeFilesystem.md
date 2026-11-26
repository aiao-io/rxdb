# DevToolsNativeFilesystem

Defined in: [native/native-files-provider.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L66)

The minimal file capabilities the provider needs from the host.

## Remarks

Deliberately does **not reuse** `StorageFilesystem` from `@aiao/rxdb-plugin-storage`: that
interface was reverse-engineered from the call sites of `RxdbFileStorage` (move, lock backends,
whole-Blob reads) — devtools needs none of those, while it lacks the one thing devtools must
have: the size and time of directory entries. Depending on that package would also drag the
desktop transport layer into a package that must bundle into a browser bundle. The assembly
layer wires the two together (see US-504's `@aiao/rxdb-plugin-storage/desktop`).

**The input is a validated sequence of segments, not a path string**: a string invites the
implementation to parse it again, and parsing again gives `..` another chance to take effect.

## Methods

### createDirectory() \{#createdirectory\}

```ts
createDirectory(segments): Promise<void>;
```

Defined in: [native/native-files-provider.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L72)

Creates the directory, creating parent directories as needed. If it already exists the provider
detects and rejects it first; implementations do not need to handle conflicts.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;`void`&gt;

---

### list() \{#list\}

```ts
list(segments): Promise<readonly DevToolsNativeEntry[]>;
```

Defined in: [native/native-files-provider.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L68)

Lists the direct entries of a directory; an empty segment sequence denotes the plugin's
dedicated root.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;readonly [`DevToolsNativeEntry`](DevToolsNativeEntry.md)[]&gt;

---

### openRead() \{#openread\}

```ts
openRead(segments): Promise<DevToolsChunkSource>;
```

Defined in: [native/native-files-provider.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L76)

Opens a byte source for on-demand reading.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;[`DevToolsChunkSource`](DevToolsChunkSource.md)&gt;

---

### openWrite() \{#openwrite\}

```ts
openWrite(segments): Promise<DevToolsChunkSink>;
```

Defined in: [native/native-files-provider.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L84)

Opens a write.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;[`DevToolsChunkSink`](DevToolsChunkSink.md)&gt;

#### Remarks

The contract matches [DevToolsChunkSink](DevToolsChunkSink.md): the target file must not be
visible to other readers before `commit()`, and `discard()` must clean up all temporary
artifacts. AC#47's "no half-written files on failure/cancel/timeout" rests on this clause.

---

### remove() \{#remove\}

```ts
remove(segments): Promise<void>;
```

Defined in: [native/native-files-provider.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L74)

Recursively removes a file or directory.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;`void`&gt;

---

### stat() \{#stat\}

```ts
stat(segments): Promise<DevToolsNativeEntry | undefined>;
```

Defined in: [native/native-files-provider.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-files-provider.ts#L70)

Fetches a single entry; `undefined` when it does not exist.

#### Parameters

| Parameter  | Type                |
| ---------- | ------------------- |
| `segments` | readonly `string`[] |

#### Returns

`Promise`&lt;[`DevToolsNativeEntry`](DevToolsNativeEntry.md) \| `undefined`&gt;
